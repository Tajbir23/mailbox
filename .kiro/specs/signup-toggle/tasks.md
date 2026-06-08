# Implementation Plan: Signup Toggle

## Overview

এই প্ল্যানটি বিদ্যমান `SiteSetting` ইনফ্রাস্ট্রাকচারের উপরে `signup_enabled` টগল বাস্তবায়ন করে। কাজগুলো শুরু হয় টেস্ট ফ্রেমওয়ার্ক ও বিশুদ্ধ লজিক helper দিয়ে, এরপর API লেয়ার (Admin_Settings_API reorder, নতুন Signup_Status_API, Registration_API enforcement), তারপর UI লেয়ার (Admin_Settings_Page, Registration_Page), এবং শেষে integration wiring। প্রতিটি ধাপ পূর্ববর্তী ধাপের উপর নির্মিত। ভাষা: JavaScript (Next.js 14 App Router), PBT লাইব্রেরি: fast-check, রানার: Jest।

## Tasks

- [x] 1. Set up testing framework and shared setting-resolution helpers
  - [x] 1.1 Configure test framework and create resolution/validation helpers
    - Jest + fast-check (`jest`, `@testing-library/react`, `@testing-library/jest-dom`, `fast-check`) devDependency হিসেবে যোগ করা এবং `package.json`-এ `"test": "jest"` স্ক্রিপ্ট যোগ করা
    - Next.js-সামঞ্জস্যপূর্ণ `jest.config.js` ও `jest.setup.js` তৈরি করা (jsdom environment, module aliases)
    - নতুন ফাইল `lib/settings/signupSetting.js`-এ একটি বিশুদ্ধ helper `resolveSignupEnabled(rawValue)` তৈরি করা যা boolean হলে সেই মান, অন্যথায় `true` ফেরত দেয় (default coercion)
    - নতুন ফাইল `lib/settings/validateSetting.js`-এ `isValidSettingValue(def, value)` helper তৈরি করা যা `def.type === "boolean"` হলে `typeof value === "boolean"` যাচাই করে
    - _Requirements: 1.3, 5.4_

- [x] 2. Implement Admin_Settings_API signup_enabled registry and reordered PATCH logic
  - [x] 2.1 Register `signup_enabled` and apply value-before-role validation order
    - `app/api/admin/settings/route.js`-এর `SETTINGS` রেজিস্ট্রিতে `signup_enabled: { default: true, type: "boolean" }` যোগ করা
    - GET হ্যান্ডলারে নিশ্চিত করা যে রেসপন্স map ডিফল্ট দিয়ে seed হয় ও stored value দিয়ে override হয়, `signup_enabled` অন্তর্ভুক্ত থাকে
    - PATCH হ্যান্ডলারের লজিক পুনর্বিন্যাস: (1) key পার্স ও known-key যাচাই → না হলে 400; (2) `isValidSettingValue` দিয়ে টাইপ ভ্যালিডেশন → ব্যর্থ হলে 400 (role চেকের আগে); (3) role !== admin → 403; (4) `findOneAndUpdate` upsert ও `200 { key, value }` ফেরত
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 2.2 Write property test for setting resolution round-trip and default
    - **Property 1: Setting resolution round-trip and default**
    - `resolveSignupEnabled` + persistence mock দিয়ে set→get fidelity ও absent/non-boolean → true যাচাই; ন্যূনতম ১০০ iteration
    - **Validates: Requirements 1.1, 1.3, 5.1, 5.4**

  - [ ]* 2.3 Write property test for non-boolean rejection
    - **Property 2: Non-boolean values are rejected**
    - arbitrary non-boolean JSON (string/number/null/object/array) PATCH → 400, role নির্বিশেষে; ন্যূনতম ১০০ iteration
    - **Validates: Requirements 1.4, 1.5**

  - [ ]* 2.4 Write unit tests for Admin_Settings_API auth gating
    - GET map-এ `signup_enabled` উপস্থিত (1.2); non-admin + boolean → 403 (1.6); admin + boolean → 200 (1.1)
    - getServerSession ও SiteSetting mock করা
    - _Requirements: 1.2, 1.6_

- [x] 3. Implement public Signup_Status_API
  - [x] 3.1 Create `/api/signup-status` GET route
    - নতুন ফাইল `app/api/signup-status/route.js` (`force-dynamic`, কোনো auth নয়)
    - শুধুমাত্র `SiteSetting.findOne({ key: "signup_enabled" })` query করা এবং `resolveSignupEnabled` দিয়ে কার্যকর মান নির্ধারণ
    - রেসপন্স অবজেক্টে ঠিক একটি কী `{ signup_enabled }` তৈরি করা; অপ্রত্যাশিত অতিরিক্ত ফিল্ড থাকলে error লগ করে শুধু `signup_enabled` ফেরত দেওয়া; DB ত্রুটিতে 500
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 3.2 Write property test for public status isolation
    - **Property 4: Public status response is isolated**
    - arbitrary অন্যান্য SiteSetting ডকুমেন্টের সংগ্রহ mock করে রেসপন্সে ঠিক একটিই কী (`signup_enabled`) যাচাই; ন্যূনতম ১০০ iteration
    - **Validates: Requirements 5.2**

  - [ ]* 3.3 Write unit tests for Signup_Status_API
    - empty store → `true` (5.4); forced-extra-field path → লগিং ও শুধু `signup_enabled` ফেরত (5.3)
    - _Requirements: 5.3, 5.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Enforce signup state in Registration_API
  - [x] 5.1 Add signup gate before field validation
    - `app/api/auth/register/route.js`-এ rate-limit চেকের পর কিন্তু ইনপুট ফিল্ড ভ্যালিডেশনের আগে `SiteSetting.findOne({ key: "signup_enabled" })` পড়া ও `resolveSignupEnabled` প্রয়োগ করা
    - disabled হলে `403 { error: "Signup is currently disabled by the administrator." }` ফেরত দেওয়া এবং কোনো ইউজার তৈরি না করা
    - enabled হলে বিদ্যমান প্রবাহ অপরিবর্তিত রেখে valid ইনপুটে 201
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 5.2 Write property test for disabled signup blocking
    - **Property 3: Disabled signup blocks all registrations**
    - arbitrary register payload (valid + malformed) সহ disabled অবস্থায় 403 ও user-create mock কখনো কল না হওয়া যাচাই; ন্যূনতম ১০০ iteration
    - **Validates: Requirements 3.2, 3.4**

  - [ ]* 5.3 Write unit tests for Registration_API gate
    - enabled + valid → 201 (3.1); disabled error message বিষয়বস্তু যাচাই (3.3)
    - _Requirements: 3.1, 3.3_

- [x] 6. Add signup toggle control to Admin_Settings_Page
  - [x] 6.1 Render and wire the signup toggle
    - `app/admin/settings/page.js`-এর প্রাথমিক state-এ `signup_enabled: true` যোগ করা যাতে fetch-পরবর্তী merge বর্তমান মান দেখায়
    - একটি নতুন কার্ড + enable/disable toggle কন্ট্রোল যোগ করা; enable → `updateSetting("signup_enabled", true)`, disable → `updateSetting("signup_enabled", false)`
    - বিদ্যমান optimistic-update প্যাটার্ন পুনঃব্যবহার: success → "Saved" indicator; failure → error বার্তা + পূর্বের state rollback
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 6.2 Write component tests for Admin_Settings_Page toggle
    - বর্তমান state রেন্ডার (2.1); enable → PATCH true (2.2); disable → PATCH false (2.3); success → "Saved" (2.4); failure → error + rollback (2.5)
    - fetch mock করা
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 7. Reflect signup state in Registration_Page
  - [x] 7.1 Fetch status and conditionally render form
    - `app/(auth)/register/page.js`-এ মাউন্টে `GET /api/signup-status` কল করা; লোডিং অবস্থায় spinner
    - `signup_enabled === true` → বিদ্যমান ফর্ম দেখানো ও submission অনুমোদন
    - `signup_enabled === false` → ফর্ম লুকানো, "signup currently disabled" বার্তা ও `/login` লিঙ্ক দেখানো, submission প্রতিরোধ
    - স্পষ্ট `false` না পেলে fail-open (ফর্ম দেখানো) নীতি প্রয়োগ
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 7.2 Write component tests for Registration_Page
    - মাউন্টে status fetch (4.1); enabled → form দৃশ্যমান (4.2); disabled → form লুকানো (4.3), disabled বার্তা (4.4), login লিঙ্ক (4.5)
    - fetch mock করা
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Integration wiring and end-to-end verification
  - [ ]* 8.1 Write integration tests for settings auth gating and registration toggle flow
    - Admin বনাম non-admin auth gating end-to-end যাচাই
    - SiteSetting persistence: toggle off → register 403 → toggle on → register 201
    - _Requirements: 1.6, 3.1, 3.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests (fast-check, ন্যূনতম ১০০ iteration প্রতিটি) ৪টি universal correctness property যাচাই করে; বাহ্যিক নির্ভরতা (MongoDB, getServerSession) mock করা হয়
- Unit ও component tests নির্দিষ্ট দৃষ্টান্ত ও UI আচরণ যাচাই করে
- বিশুদ্ধ helper (`resolveSignupEnabled`, `isValidSettingValue`) প্রথমে তৈরি করা হয় যাতে API ও UI উভয় লেয়ার single source of truth পুনঃব্যবহার করতে পারে

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "6.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "5.1", "6.2", "7.2"] },
    { "id": 3, "tasks": ["5.2", "5.3"] },
    { "id": 4, "tasks": ["8.1"] }
  ]
}
```
