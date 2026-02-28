import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Mailbox from "@/lib/models/Mailbox";
import User from "@/lib/models/User";

// POST /api/mailboxes/[id]/share – share mailbox with another user
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Only the owner can share
    const mailbox = await Mailbox.findOne({
      _id: id,
      ownerId: session.user.id,
    });
    if (!mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found or you are not the owner" },
        { status: 404 }
      );
    }

    // Find the target user
    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser) {
      return NextResponse.json(
        { error: "No user found with that email" },
        { status: 404 }
      );
    }

    // Prevent sharing with yourself
    if (targetUser._id.toString() === session.user.id) {
      return NextResponse.json(
        { error: "You cannot share with yourself" },
        { status: 400 }
      );
    }

    // Check if already shared
    if (mailbox.sharedWith.map((id) => id.toString()).includes(targetUser._id.toString())) {
      return NextResponse.json(
        { error: "Already shared with this user" },
        { status: 409 }
      );
    }

    mailbox.sharedWith.push(targetUser._id);
    await mailbox.save();

    const updated = await Mailbox.findById(mailbox._id)
      .populate("domainId", "name")
      .populate("ownerId", "name email")
      .populate("sharedWith", "name email");

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/mailboxes/[id]/share – remove a shared user
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const { id } = params;
    const { userId } = await request.json();

    const mailbox = await Mailbox.findOne({
      _id: id,
      ownerId: session.user.id,
    });
    if (!mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found or you are not the owner" },
        { status: 404 }
      );
    }

    mailbox.sharedWith = mailbox.sharedWith.filter(
      (uid) => uid.toString() !== userId
    );
    await mailbox.save();

    const updated = await Mailbox.findById(mailbox._id)
      .populate("domainId", "name")
      .populate("ownerId", "name email")
      .populate("sharedWith", "name email");

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
