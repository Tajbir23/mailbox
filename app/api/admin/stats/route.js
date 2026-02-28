export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/lib/models/User";
import Mailbox from "@/lib/models/Mailbox";
import IncomingEmail from "@/lib/models/IncomingEmail";
import Domain from "@/lib/models/Domain";
import os from "os";

// GET /api/admin/stats – server/platform statistics
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();

    // Gather all stats in parallel
    const [
      totalUsers,
      totalMailboxes,
      totalEmails,
      totalDomains,
      verifiedDomains,
      activeMailboxes,
      unreadEmails,
      recentUsers,
      recentEmails,
      usersByRole,
      emailsToday,
      emailsThisWeek,
      emailsThisMonth,
      topMailboxes,
      storageStats,
    ] = await Promise.all([
      User.countDocuments(),
      Mailbox.countDocuments(),
      IncomingEmail.countDocuments(),
      Domain.countDocuments(),
      Domain.countDocuments({ verificationStatus: "verified" }),
      Mailbox.countDocuments({ isActive: true }),
      IncomingEmail.countDocuments({ isRead: false }),

      // Recent 7 users
      User.find()
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(7)
        .lean(),

      // Recent 10 emails
      IncomingEmail.find()
        .select("from to subject receivedAt isRead mailboxId")
        .sort({ receivedAt: -1 })
        .limit(10)
        .lean(),

      // Users by role
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),

      // Emails today
      IncomingEmail.countDocuments({
        receivedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),

      // Emails this week
      IncomingEmail.countDocuments({
        receivedAt: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      }),

      // Emails this month
      IncomingEmail.countDocuments({
        receivedAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      }),

      // Top 5 mailboxes by email count
      IncomingEmail.aggregate([
        { $group: { _id: "$mailboxId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "mailboxes",
            localField: "_id",
            foreignField: "_id",
            as: "mailbox",
          },
        },
        { $unwind: { path: "$mailbox", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            count: 1,
            emailAddress: "$mailbox.emailAddress",
          },
        },
      ]),

      // Storage estimation (email collection stats)
      IncomingEmail.collection.stats().catch(() => null),
    ]);

    // User growth (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Email volume (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const emailVolume = await IncomingEmail.aggregate([
      { $match: { receivedAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$receivedAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Roles map
    const rolesMap = {};
    usersByRole.forEach((r) => {
      rolesMap[r._id] = r.count;
    });

    // System info
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      usedMemory: os.totalmem() - os.freemem(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || "Unknown",
      loadAvg: os.loadavg(),
      nodeVersion: process.version,
      processUptime: process.uptime(),
      processMemory: process.memoryUsage(),
    };

    return NextResponse.json({
      overview: {
        totalUsers,
        totalMailboxes,
        totalEmails,
        totalDomains,
        verifiedDomains,
        activeMailboxes,
        unreadEmails,
        admins: rolesMap.admin || 0,
        regularUsers: rolesMap.user || 0,
      },
      emailStats: {
        today: emailsToday,
        thisWeek: emailsThisWeek,
        thisMonth: emailsThisMonth,
      },
      topMailboxes,
      recentUsers,
      recentEmails,
      userGrowth,
      emailVolume,
      storage: storageStats
        ? {
            dataSize: storageStats.size || 0,
            storageSize: storageStats.storageSize || 0,
            count: storageStats.count || 0,
            avgObjSize: storageStats.avgObjSize || 0,
          }
        : null,
      system: systemInfo,
    });
  } catch (err) {
    console.error("Stats error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
