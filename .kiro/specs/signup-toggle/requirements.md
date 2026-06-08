# Requirements Document

## Introduction

এই ফিচারটি অ্যাডমিনকে ওয়েবসাইটের সাইন-আপ (নতুন ইউজার রেজিস্ট্রেশন) সুবিধা চালু বা বন্ধ করার নিয়ন্ত্রণ দেয়। অ্যাডমিন যেকোনো সময় সাইন-আপ চালু (enable) বা বন্ধ (disable) করতে পারবেন। সাইন-আপ বন্ধ থাকলে কোনো নতুন ইউজার অ্যাকাউন্ট তৈরি করতে পারবে না — তারা কেবল লগইন করতে পারবে। সাইন-আপ চালু থাকলে নতুন ইউজাররা স্বাভাবিকভাবে রেজিস্টার করতে পারবে।

এই সেটিংটি বিদ্যমান অ্যাডমিন সেটিংস ইনফ্রাস্ট্রাকচার (`SiteSetting` মডেল এবং `/api/admin/settings` API) ব্যবহার করে পরিচালিত হবে এবং রেজিস্ট্রেশন UI ও রেজিস্ট্রেশন API উভয় জায়গায় enforce করা হবে।

## Glossary

- **Signup_Setting**: সাইট-ব্যাপী একটি বুলিয়ান কনফিগারেশন ভ্যালু (`signup_enabled`) যা নির্ধারণ করে নতুন ইউজার রেজিস্ট্রেশন অনুমোদিত কিনা। এটি `SiteSetting` কালেকশনে সংরক্ষিত হয়।
- **Admin_Settings_API**: অ্যাডমিন সেটিংস পরিচালনার endpoint (`/api/admin/settings`) যা GET ও PATCH সমর্থন করে এবং কেবল অ্যাডমিন রোলের জন্য অনুমোদিত।
- **Admin_Settings_Page**: অ্যাডমিন সেটিংস UI (`/admin/settings`) যেখানে অ্যাডমিন Signup_Setting দেখতে ও পরিবর্তন করতে পারেন।
- **Registration_API**: নতুন ইউজার তৈরির endpoint (`/api/auth/register`)।
- **Registration_Page**: নতুন ইউজার রেজিস্ট্রেশন UI (`/register`)।
- **Signup_Status_API**: একটি পাবলিকলি পঠনযোগ্য endpoint যা Registration_Page-কে অ্যাডমিন অথেন্টিকেশন ছাড়াই Signup_Setting-এর বর্তমান মান জানায়।
- **Admin**: `admin` রোলধারী অথেন্টিকেটেড ইউজার।
- **Visitor**: লগইন না করা একজন ব্যবহারকারী যিনি রেজিস্টার করার চেষ্টা করতে পারেন।

## Requirements

### Requirement 1: অ্যাডমিন কর্তৃক সাইন-আপ টগল নিয়ন্ত্রণ

**User Story:** As an Admin, I want to turn the website's signup option on or off, so that I can control whether new users are allowed to register.

#### Acceptance Criteria

1. WHEN an Admin sends a PATCH request to the Admin_Settings_API with key `signup_enabled` and a boolean value, THE Admin_Settings_API SHALL persist the value to the Signup_Setting and return the stored key and value.
2. WHEN an Admin sends a GET request to the Admin_Settings_API, THE Admin_Settings_API SHALL include the current Signup_Setting value in the response.
3. IF no Signup_Setting value has been stored, THEN THE Admin_Settings_API SHALL return `true` as the default value for `signup_enabled`.
4. WHEN a PATCH request for `signup_enabled` is received, THE Admin_Settings_API SHALL validate the value data type before checking the requester role.
5. IF a PATCH request for `signup_enabled` contains a value that is not a boolean, THEN THE Admin_Settings_API SHALL return an error response with HTTP status 400, including for requests from non-admin users.
6. IF a request to read or modify the Signup_Setting via the Admin_Settings_API comes from a user whose role is not `admin` and the request value is valid, THEN THE Admin_Settings_API SHALL return an error response with HTTP status 403.

### Requirement 2: অ্যাডমিন সেটিংস UI-তে সাইন-আপ টগল

**User Story:** As an Admin, I want a control on the settings page to enable or disable signup, so that I can change the signup state without using the API directly.

#### Acceptance Criteria

1. WHEN the Admin_Settings_Page loads for an Admin, THE Admin_Settings_Page SHALL display the current Signup_Setting state as either enabled or disabled.
2. WHEN an Admin selects the enable control on the Admin_Settings_Page, THE Admin_Settings_Page SHALL send a PATCH request to the Admin_Settings_API setting `signup_enabled` to `true`.
3. WHEN an Admin selects the disable control on the Admin_Settings_Page, THE Admin_Settings_Page SHALL send a PATCH request to the Admin_Settings_API setting `signup_enabled` to `false`.
4. WHEN the Admin_Settings_API confirms a successful Signup_Setting update, THE Admin_Settings_Page SHALL display a saved confirmation indicator.
5. IF the Signup_Setting update request fails, THEN THE Admin_Settings_Page SHALL display an error message and restore the previously displayed state.

### Requirement 3: রেজিস্ট্রেশন API-তে সাইন-আপ অবস্থা enforce করা

**User Story:** As an Admin, I want the registration API to reject new registrations while signup is disabled, so that no one can create an account when I have turned signup off.

#### Acceptance Criteria

1. WHILE the Signup_Setting is enabled, WHEN a Visitor submits valid registration data to the Registration_API, THE Registration_API SHALL create a new user account and return HTTP status 201.
2. WHILE the Signup_Setting is disabled, WHEN a Visitor submits registration data to the Registration_API, THE Registration_API SHALL reject the request with HTTP status 403 and SHALL NOT create a new user account.
3. WHILE the Signup_Setting is disabled, WHEN the Registration_API rejects a registration request, THE Registration_API SHALL return a descriptive error message indicating that signup is currently disabled.
4. THE Registration_API SHALL evaluate the current Signup_Setting value before validating registration input fields.

### Requirement 4: রেজিস্ট্রেশন UI-তে সাইন-আপ অবস্থা প্রতিফলন

**User Story:** As a Visitor, I want the registration page to reflect whether signup is open, so that I understand when I cannot create an account and can log in instead.

#### Acceptance Criteria

1. WHEN the Registration_Page loads, THE Registration_Page SHALL request the current Signup_Setting value from the Signup_Status_API.
2. WHILE the Signup_Setting is enabled, THE Registration_Page SHALL display the registration form and allow submission.
3. WHILE the Signup_Setting is disabled, THE Registration_Page SHALL hide the registration form immediately and prevent any new registration submission.
4. WHILE the Signup_Setting is disabled, THE Registration_Page SHALL display a message stating that signup is currently disabled.
5. WHILE the Signup_Setting is disabled, THE Registration_Page SHALL display a link to the login page.

### Requirement 5: সাইন-আপ অবস্থা পাবলিকলি পঠনযোগ্য করা

**User Story:** As a Visitor, I want the registration page to know the signup state without admin access, so that the page can show the correct content to logged-out users.

#### Acceptance Criteria

1. WHEN any client sends a GET request to the Signup_Status_API, THE Signup_Status_API SHALL return the current stored Signup_Setting value.
2. WHEN the Signup_Status_API builds its response, THE Signup_Status_API SHALL include only the Signup_Setting value and exclude all other site settings.
3. IF other site settings are inadvertently included while building the response, THEN THE Signup_Status_API SHALL log the error and return the Signup_Setting value.
4. IF no Signup_Setting value has been stored, THEN THE Signup_Status_API SHALL return `true` as the default value.
