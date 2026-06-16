// Feature: send-email, Task 3.2: Unit tests for sanitizeOutboundHtml
// Validates: Requirements 4.4
import { sanitizeOutboundHtml } from "@/lib/html-sanitize";

describe("sanitizeOutboundHtml", () => {
  describe("empty / falsy input", () => {
    it.each([
      ["empty string", ""],
      ["undefined", undefined],
      ["null", null],
      ["false", false],
      ["zero", 0],
    ])("returns \"\" for %s", (_label, input) => {
      expect(sanitizeOutboundHtml(input)).toBe("");
    });
  });

  describe("<script> block removal", () => {
    it("removes a simple <script> block", () => {
      const out = sanitizeOutboundHtml(
        '<p>hi</p><script>alert("x")</script>'
      );
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toContain("alert");
      expect(out).toContain("<p>hi</p>");
    });

    it("removes a multiline <script> block with attributes", () => {
      const out = sanitizeOutboundHtml(
        '<script type="text/javascript">\n  var a = 1;\n  doEvil();\n</script><b>ok</b>'
      );
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toContain("doEvil");
      expect(out).toContain("<b>ok</b>");
    });

    it("removes multiple <script> blocks", () => {
      const out = sanitizeOutboundHtml(
        "<script>a()</script><div>mid</div><SCRIPT>b()</SCRIPT>"
      );
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toContain("a()");
      expect(out).not.toContain("b()");
      expect(out).toContain("<div>mid</div>");
    });
  });

  describe("inline on*= event handler removal", () => {
    it("removes a double-quoted handler", () => {
      const out = sanitizeOutboundHtml('<div onclick="steal()">x</div>');
      expect(out).not.toMatch(/onclick/i);
      expect(out).not.toContain("steal()");
      expect(out).toContain("<div");
      expect(out).toContain(">x</div>");
    });

    it("removes a single-quoted handler", () => {
      const out = sanitizeOutboundHtml("<img src='a.png' onerror='boom()'>");
      expect(out).not.toMatch(/onerror/i);
      expect(out).not.toContain("boom()");
    });

    it("removes an unquoted handler", () => {
      const out = sanitizeOutboundHtml("<body onload=init()>");
      expect(out).not.toMatch(/onload/i);
      expect(out).not.toContain("init()");
    });

    it("removes multiple handlers on one element", () => {
      const out = sanitizeOutboundHtml(
        '<a href="https://example.com" onmouseover="x()" onclick="y()">link</a>'
      );
      expect(out).not.toMatch(/onmouseover/i);
      expect(out).not.toMatch(/onclick/i);
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain(">link</a>");
    });
  });

  describe("dangerous URI scheme neutralization", () => {
    it("neutralizes javascript: URIs (replaced with blocked:)", () => {
      const out = sanitizeOutboundHtml('<a href="javascript:alert(1)">x</a>');
      expect(out).not.toMatch(/javascript\s*:/i);
      expect(out).toContain("blocked:");
    });

    it("neutralizes vbscript: URIs", () => {
      const out = sanitizeOutboundHtml('<a href="vbscript:Evil">x</a>');
      expect(out).not.toMatch(/vbscript\s*:/i);
      expect(out).toContain("blocked:");
    });

    it("neutralizes data:text/html URIs", () => {
      const out = sanitizeOutboundHtml(
        '<a href="data:text/html,<script>bad()</script>">x</a>'
      );
      expect(out).not.toMatch(/data\s*:\s*text\/html/i);
      expect(out).toContain("blocked:");
    });

    it("neutralizes schemes regardless of casing", () => {
      const out = sanitizeOutboundHtml('<a href="JaVaScRiPt:go()">x</a>');
      expect(out).not.toMatch(/javascript\s*:/i);
      expect(out).toContain("blocked:");
    });
  });

  describe("benign markup preservation", () => {
    it("preserves a paragraph", () => {
      const input = "<p>Hello world</p>";
      expect(sanitizeOutboundHtml(input)).toBe(input);
    });

    it("preserves a safe anchor", () => {
      const input = '<a href="https://example.com">Example</a>';
      expect(sanitizeOutboundHtml(input)).toBe(input);
    });

    it("preserves bold/italic formatting", () => {
      const input = "<b>bold</b> and <i>italic</i> and <u>underline</u>";
      expect(sanitizeOutboundHtml(input)).toBe(input);
    });

    it("preserves a mailto link", () => {
      const input = '<a href="mailto:someone@example.com">mail</a>';
      expect(sanitizeOutboundHtml(input)).toBe(input);
    });

    it("preserves nested benign structure", () => {
      const input =
        '<div><p>Hi <b>there</b></p><ul><li>one</li><li>two</li></ul></div>';
      expect(sanitizeOutboundHtml(input)).toBe(input);
    });
  });

  describe("combined hostile input", () => {
    it("strips all threats while keeping benign content", () => {
      const out = sanitizeOutboundHtml(
        '<p>Hi</p><script>steal()</script>' +
          '<a href="javascript:x()" onclick="y()">click</a>' +
          '<b>safe</b>'
      );
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(/onclick/i);
      expect(out).not.toMatch(/javascript\s*:/i);
      expect(out).toContain("<p>Hi</p>");
      expect(out).toContain("<b>safe</b>");
      expect(out).toContain("blocked:");
    });
  });
});
