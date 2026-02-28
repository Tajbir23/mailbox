// One-time script to fix genuinesoftmart.store domain:
// - Set isSystemDomain = true
// - Reset verificationStatus to "verified"

const { MongoClient } = require("mongodb");

const MONGODB_URI =
  "mongodb+srv://akash123:akash123@cluster0.sdyx3bs.mongodb.net/mailBox?appName=Cluster0";

async function main() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("mailBox");

    // Fix all admin-added domains (mark as system + verified)
    const result = await db.collection("domains").updateMany(
      { name: "genuinesoftmart.store" },
      {
        $set: {
          isSystemDomain: true,
          verificationStatus: "verified",
          "dnsRecords.mxVerified": true,
          "dnsRecords.txtVerified": true,
          verifiedAt: new Date(),
        },
      }
    );

    console.log(`Updated ${result.modifiedCount} domain(s)`);

    // Show result
    const domain = await db
      .collection("domains")
      .findOne({ name: "genuinesoftmart.store" });
    console.log("Domain now:", JSON.stringify(domain, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(console.error);
