// Unit tests for the per-domain DNS-record builder (domain setup guide).
import crypto from "crypto";
import {
  buildDomainDnsRecords,
  dkimPublicKeyValue,
  resolveDkimPrivateKey,
} from "@/lib/dns-records";

function genDkim() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const expectedPub = publicKey
    .toString()
    .split("\n")
    .filter((l) => l && !l.startsWith("-----"))
    .join("");
  return { privateKeyPem: privateKey.toString(), expectedPub };
}

const domain = {
  name: "example.com",
  verificationToken: "tok123",
  verificationStatus: "pending",
  websiteStatus: "none",
  dnsRecords: { mxVerified: false, txtVerified: false },
};

const opts = {
  mailHostname: "mail.host.test",
  serverIp: "1.2.3.4",
  dkimSelector: "mail",
};

describe("dkimPublicKeyValue", () => {
  it("derives the public key from a PEM private key", () => {
    const { privateKeyPem, expectedPub } = genDkim();
    expect(dkimPublicKeyValue(privateKeyPem)).toBe(expectedPub);
  });

  it("derives from a base64-encoded PEM private key", () => {
    const { privateKeyPem, expectedPub } = genDkim();
    const b64 = Buffer.from(privateKeyPem).toString("base64");
    expect(dkimPublicKeyValue(b64)).toBe(expectedPub);
    expect(resolveDkimPrivateKey(b64)).toContain("PRIVATE KEY");
  });

  it("returns '' for missing/invalid keys", () => {
    expect(dkimPublicKeyValue("")).toBe("");
    expect(dkimPublicKeyValue("not-a-key")).toBe("");
  });
});

describe("buildDomainDnsRecords", () => {
  it("includes ownership MX + TXT verify records", () => {
    const out = buildDomainDnsRecords(domain, opts);
    const verify = out.groups.find((g) => g.id === "verify");
    expect(verify).toBeTruthy();
    const mx = verify.records.find((r) => r.type === "MX");
    const txt = verify.records.find((r) => r.type === "TXT");
    expect(mx.value).toBe("mail.host.test");
    expect(mx.priority).toBe(10);
    expect(txt.value).toBe("mailbox-verify=tok123");
  });

  it("includes SPF and DMARC, and DKIM only when a key is configured", () => {
    const withoutDkim = buildDomainDnsRecords(domain, opts);
    const sending1 = withoutDkim.groups.find((g) => g.id === "sending");
    expect(sending1.records.some((r) => r.value.startsWith("v=spf1"))).toBe(true);
    expect(sending1.records.some((r) => r.host === "_dmarc")).toBe(true);
    expect(sending1.records.some((r) => r.value.startsWith("v=DKIM1"))).toBe(false);
    expect(withoutDkim.dkimConfigured).toBe(false);

    const { privateKeyPem } = genDkim();
    const withDkim = buildDomainDnsRecords(domain, { ...opts, dkimPrivateKey: privateKeyPem });
    const sending2 = withDkim.groups.find((g) => g.id === "sending");
    const dkim = sending2.records.find((r) => r.value.startsWith("v=DKIM1"));
    expect(dkim).toBeTruthy();
    expect(dkim.host).toBe("mail._domainkey");
    expect(withDkim.dkimConfigured).toBe(true);
  });

  it("includes hosting A records pointing at the server IP", () => {
    const out = buildDomainDnsRecords(domain, opts);
    const hosting = out.groups.find((g) => g.id === "hosting");
    expect(hosting.records).toHaveLength(2);
    expect(hosting.records.every((r) => r.value === "1.2.3.4")).toBe(true);
  });

  it("reflects the approved flag from websiteStatus", () => {
    expect(buildDomainDnsRecords(domain, opts).approved).toBe(false);
    const approved = buildDomainDnsRecords({ ...domain, websiteStatus: "approved" }, opts);
    expect(approved.approved).toBe(true);
  });

  it("omits hosting records and uses a soft SPF when no server IP is known", () => {
    const out = buildDomainDnsRecords(domain, { ...opts, serverIp: "" });
    expect(out.groups.find((g) => g.id === "hosting")).toBeUndefined();
    const spf = out.groups
      .find((g) => g.id === "sending")
      .records.find((r) => r.value.startsWith("v=spf1"));
    expect(spf.value).toBe("v=spf1 a mx ~all");
  });
});
