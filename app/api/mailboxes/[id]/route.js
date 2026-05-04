import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";

// DELETE /api/mailboxes/[id] – delete a mailbox and all its emails
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;
    const userId = session.user.id;

    const mailbox = await Mailbox.findOne({ _id: id, ownerId: userId });
    if (!mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found or you are not the owner" },
        { status: 404 }
      );
    }

    // Delete all emails in this mailbox
    await IncomingEmail.deleteMany({ mailboxId: id });

    // Delete the mailbox
    await Mailbox.deleteOne({ _id: id });

    return NextResponse.json({ success: true, message: "Mailbox and all emails deleted" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/mailboxes/[id] – transfer ownership or set expiry
export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;
    const userId = session.user.id;
    const body = await request.json();

    const mailbox = await Mailbox.findOne({ _id: id, ownerId: userId });
    if (!mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found or you are not the owner" },
        { status: 404 }
      );
    }

    // Transfer ownership
    if (body.action === "transfer") {
      const { newOwnerEmail } = body;
      if (!newOwnerEmail) {
        return NextResponse.json({ error: "newOwnerEmail is required" }, { status: 400 });
      }

      const User = (await import("@/lib/models/User")).default;
      const newOwner = await User.findOne({ email: newOwnerEmail.toLowerCase().trim() }).lean();
      if (!newOwner) {
        return NextResponse.json({ error: "User not found with that email" }, { status: 404 });
      }

      if (newOwner._id.toString() === userId) {
        return NextResponse.json({ error: "Cannot transfer to yourself" }, { status: 400 });
      }

      // Transfer: set new owner, remove from sharedWith if present, add old owner to sharedWith optionally
      mailbox.ownerId = newOwner._id;
      mailbox.sharedWith = mailbox.sharedWith.filter(
        (uid) => uid.toString() !== newOwner._id.toString()
      );
      await mailbox.save();

      const populated = await Mailbox.findById(id)
        .populate("ownerId", "name email")
        .populate("sharedWith", "name email")
        .lean();

      return NextResponse.json({ success: true, message: "Ownership transferred", mailbox: populated });
    }

    // Set expiry date (owner only)
    if (body.action === "setExpiry") {
      if (mailbox.ownerId.toString() !== userId) {
        return NextResponse.json({ error: "Only the owner can set the auto-delete timer" }, { status: 403 });
      }
      const { expiresAt } = body;

      if (expiresAt === null) {
        // Remove expiry
        mailbox.expiresAt = null;
        await mailbox.save();
        return NextResponse.json({ success: true, message: "Expiry removed", expiresAt: null });
      }

      const expiryDate = new Date(expiresAt);
      if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
        return NextResponse.json({ error: "Expiry date must be in the future" }, { status: 400 });
      }

      mailbox.expiresAt = expiryDate;
      await mailbox.save();

      return NextResponse.json({ success: true, message: "Expiry set", expiresAt: mailbox.expiresAt });
    }

    // Toggle public access (owner only — making a shared mailbox public exposes everyone's emails)
    if (body.action === "setPublic") {
      if (mailbox.ownerId.toString() !== userId) {
        return NextResponse.json({ error: "Only the owner can change visibility" }, { status: 403 });
      }
      mailbox.isPublic = Boolean(body.isPublic);
      await mailbox.save();
      return NextResponse.json({
        success: true,
        message: mailbox.isPublic ? "Mailbox is now public" : "Mailbox is now private",
        isPublic: mailbox.isPublic,
      });
    }

    // Owner-set mailbox tags (owner only — shared users see read-only)
    if (body.action === "setTags") {
      if (mailbox.ownerId.toString() !== userId) {
        return NextResponse.json({ error: "Only the owner can set tags" }, { status: 403 });
      }
      if (!Array.isArray(body.tags)) {
        return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
      }
      const cleaned = body.tags
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
        .map((t) => t.slice(0, 40));
      mailbox.tags = Array.from(new Set(cleaned)).slice(0, 30);
      await mailbox.save();
      return NextResponse.json({ success: true, tags: mailbox.tags });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
