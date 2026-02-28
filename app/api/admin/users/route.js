import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import Mailbox from "@/lib/models/Mailbox";
import bcrypt from "bcryptjs";

// GET /api/admin/users – list all users with stats
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Get mailbox counts per user
    const userIds = users.map((u) => u._id);
    const mailboxCounts = await Mailbox.aggregate([
      { $match: { ownerId: { $in: userIds } } },
      { $group: { _id: "$ownerId", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    mailboxCounts.forEach((m) => {
      countMap[m._id.toString()] = m.count;
    });

    const enrichedUsers = users.map((u) => ({
      ...u,
      mailboxCount: countMap[u._id.toString()] || 0,
    }));

    return NextResponse.json({
      users: enrichedUsers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/admin/users – update user (role, reset password)
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent modifying own account's role
    if (id === session.user.id && action === "toggleRole") {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }

    if (action === "toggleRole") {
      user.role = user.role === "admin" ? "user" : "admin";
      await user.save();
      return NextResponse.json({ message: `Role changed to ${user.role}`, role: user.role });
    }

    if (action === "resetPassword") {
      const { newPassword } = body;
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        );
      }
      user.password = await bcrypt.hash(newPassword, 12);
      await user.save();
      return NextResponse.json({ message: "Password reset successfully" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/admin/users?id=xxx – delete user and their mailboxes
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user's mailboxes
    const { default: IncomingEmail } = await import("@/lib/models/IncomingEmail");
    const mailboxes = await Mailbox.find({ ownerId: id });
    const mailboxIds = mailboxes.map((m) => m._id);

    // Delete emails for all user's mailboxes
    if (mailboxIds.length > 0) {
      await IncomingEmail.deleteMany({ mailboxId: { $in: mailboxIds } });
    }
    await Mailbox.deleteMany({ ownerId: id });

    // Also remove user from sharedWith arrays
    await Mailbox.updateMany(
      { sharedWith: id },
      { $pull: { sharedWith: id } }
    );

    // Delete user's domains
    const { default: Domain } = await import("@/lib/models/Domain");
    await Domain.deleteMany({ ownerId: id, isSystemDomain: { $ne: true } });

    // Delete user
    await User.findByIdAndDelete(id);

    return NextResponse.json({
      message: "User and associated data deleted",
      deletedMailboxes: mailboxIds.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
