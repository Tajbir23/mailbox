# Requirements Document

## Introduction

This feature adds outbound email capability to the Mailbox SaaS application, which is currently receive-only. An authenticated user who owns or has shared access to a mailbox will be able to compose a new message from the website UI and send it to any external recipient, using one of their mailbox addresses as the sender. The feature also covers reply and forward flows from received emails, attachment handling, sent-message storage, outbound delivery through an SMTP relay, recipient and content validation, rate limiting to prevent abuse, and real-time UI feedback consistent with the existing Socket.io-based experience.

This document captures the requirements only. Technical decisions (library choice, relay configuration, schema field-by-field design) are deferred to the design phase.

## Glossary

- **Send_Service**: The server-side component (API route plus delivery logic) responsible for accepting a compose request, validating it, persisting an outbound record, and delivering the message to the relay.
- **Outbound_Delivery_Agent**: The component that hands an accepted message to an external SMTP relay or mail transfer agent for delivery to the recipient's mail server.
- **Compose_UI**: The website user interface through which a user writes and submits a new, reply, or forward message.
- **SentEmail_Store**: The persistence layer (a MongoDB collection) that stores records of messages submitted for sending, including delivery status.
- **Mailbox**: An email address record owned by a user and optionally shared with other users, belonging to a verified Domain.
- **Sender_Mailbox**: The Mailbox whose `emailAddress` is used in the `From` field of an outbound message.
- **Authorized_User**: An authenticated user who is the owner of, or is listed in `sharedWith` for, the Sender_Mailbox.
- **Recipient**: An external email address to which an outbound message is addressed (To, Cc, or Bcc).
- **Verified_Domain**: A Domain whose `verificationStatus` is `verified`.
- **Rate_Limit_Window**: A fixed rolling time period used to count messages sent by a user or mailbox for abuse prevention.
- **Delivery_Status**: The state of an outbound message: `queued`, `sent`, or `failed`.
- **Attachment**: A file included with an outbound message, characterized by filename, content type, size, and content.

## Requirements

### Requirement 1: Compose and Send a New Email

**User Story:** As an authorized user, I want to compose a new email from one of my mailbox addresses and send it to any external recipient, so that I can initiate outbound communication from the website.

#### Acceptance Criteria

1. WHEN an Authorized_User submits a compose request containing a Sender_Mailbox, at least one Recipient, a subject, and a body, THE Send_Service SHALL accept the request for delivery.
2. WHEN the Send_Service accepts a compose request, THE Send_Service SHALL set the message `From` field to the `emailAddress` of the Sender_Mailbox.
3. WHEN the Send_Service accepts a compose request, THE Send_Service SHALL create a SentEmail_Store record with Delivery_Status `queued` before handing the message to the Outbound_Delivery_Agent.
4. WHEN the Outbound_Delivery_Agent confirms the relay accepted the message, THE Send_Service SHALL update the corresponding SentEmail_Store record Delivery_Status to `sent`.
5. IF the Outbound_Delivery_Agent reports a delivery failure, THEN THE Send_Service SHALL update the corresponding SentEmail_Store record Delivery_Status to `failed` and SHALL record the failure reason.
6. THE Send_Service SHALL support a `To` recipient list, an optional `Cc` recipient list, and an optional `Bcc` recipient list.

### Requirement 2: Sender Authorization

**User Story:** As a mailbox owner, I want only authorized users to send from my mailbox address, so that no one can impersonate my mailbox.

#### Acceptance Criteria

1. IF an unauthenticated request is submitted to the Send_Service, THEN THE Send_Service SHALL reject the request with an unauthorized error.
2. IF the requesting user is neither the owner of nor listed in `sharedWith` for the Sender_Mailbox, THEN THE Send_Service SHALL reject the request with an access-denied error.
3. IF the Sender_Mailbox `isActive` value is false, THEN THE Send_Service SHALL reject the request with an error indicating the mailbox is inactive.
4. IF the Sender_Mailbox belongs to a Domain that is not a Verified_Domain, THEN THE Send_Service SHALL reject the request with an error indicating the sending domain is not verified.

### Requirement 3: Recipient Address Validation

**User Story:** As an authorized user, I want recipient addresses to be validated before sending, so that messages are not submitted with malformed addresses.

#### Acceptance Criteria

1. IF a compose request contains no Recipient in the `To` list, THEN THE Send_Service SHALL reject the request with an error indicating at least one recipient is required.
2. IF any Recipient address does not conform to a valid email address format, THEN THE Send_Service SHALL reject the request and SHALL identify each invalid address.
3. WHEN every Recipient address conforms to a valid email address format and all other validation rules pass, THE Send_Service SHALL allow the request to proceed to delivery.
4. WHERE the combined count of To, Cc, and Bcc recipients exceeds 50, THE Send_Service SHALL reject the request with an error indicating the recipient limit is exceeded.
5. THE Send_Service SHALL normalize each Recipient address to lowercase before delivery.

### Requirement 4: Message Content Validation

**User Story:** As an authorized user, I want the message content to be validated and size-bounded, so that the system stays within delivery limits and rejects empty messages.

#### Acceptance Criteria

1. IF a compose request contains an empty body and an empty subject, THEN THE Send_Service SHALL reject the request with an error indicating that content is required.
2. WHERE a subject is provided, THE Send_Service SHALL limit the subject to 998 characters.
3. WHERE a subject is omitted, THE Send_Service SHALL set the subject to "(No Subject)".
4. THE Send_Service SHALL accept a message body provided as plain text, as HTML, or as both.
5. WHERE the total message size including attachments exceeds 25 megabytes, THE Send_Service SHALL reject the request with an error indicating the size limit is exceeded.

### Requirement 5: Attachments

**User Story:** As an authorized user, I want to attach files to an outbound email, so that I can share documents with recipients.

#### Acceptance Criteria

1. WHERE one or more Attachments are included in a compose request, THE Send_Service SHALL include each Attachment in the delivered message with its filename and content type.
2. WHERE an Attachment is included, THE Send_Service SHALL store the Attachment filename, content type, and size in the SentEmail_Store record.
3. IF the combined size of all Attachments exceeds 25 megabytes, THEN THE Send_Service SHALL reject the request with an error indicating the attachment size limit is exceeded.

### Requirement 6: Reply to a Received Email

**User Story:** As an authorized user, I want to reply to a received email, so that I can respond within the existing conversation.

#### Acceptance Criteria

1. WHEN an Authorized_User initiates a reply to a received email, THE Compose_UI SHALL pre-populate the `To` field with the original sender address.
2. WHEN an Authorized_User initiates a reply to a received email, THE Compose_UI SHALL pre-populate the subject with the original subject prefixed by "Re: " unless the original subject already begins with "Re: ".
3. WHEN an Authorized_User initiates a reply to a received email, THE Compose_UI SHALL set the Sender_Mailbox to the mailbox that received the original email.
4. WHEN the Send_Service accepts a reply, THE Send_Service SHALL record the originating received email reference in the SentEmail_Store record.

### Requirement 7: Forward a Received Email

**User Story:** As an authorized user, I want to forward a received email to another recipient, so that I can share received messages.

#### Acceptance Criteria

1. WHEN an Authorized_User initiates a forward of a received email, THE Compose_UI SHALL pre-populate the subject with the original subject prefixed by "Fwd: " unless the original subject already begins with "Fwd: ".
2. WHEN an Authorized_User initiates a forward of a received email, THE Compose_UI SHALL include the original message body in the forwarded message body.
3. WHERE the original received email contains Attachments, THE Compose_UI SHALL include those Attachments in the forwarded message.

### Requirement 8: Sent Message Storage and Retrieval

**User Story:** As an authorized user, I want sent messages to be stored and viewable, so that I can review what I have sent from my mailbox.

#### Acceptance Criteria

1. WHEN the Send_Service creates a SentEmail_Store record, THE Send_Service SHALL associate the record with the Sender_Mailbox identifier and the sending user identifier.
2. WHEN an Authorized_User requests the sent messages for a Sender_Mailbox, THE Send_Service SHALL return only records associated with that Sender_Mailbox.
3. IF a user who is neither the owner of nor listed in `sharedWith` for a mailbox requests its sent messages, THEN THE Send_Service SHALL return no records and SHALL respond with an access-denied error.
4. WHEN an Authorized_User requests sent messages, THE Send_Service SHALL return the records ordered from most recent to least recent.
5. WHERE a request for sent messages includes pagination parameters, THE Send_Service SHALL return at most 100 records per page.

### Requirement 9: Rate Limiting and Abuse Prevention

**User Story:** As a system operator, I want outbound sending to be rate limited, so that the platform is protected from spam and abuse.

#### Acceptance Criteria

1. WHILE a user has reached the configured maximum number of messages within the Rate_Limit_Window, THE Send_Service SHALL reject further compose requests from that user with a rate-limit error.
2. WHILE a Sender_Mailbox has reached the configured maximum number of messages within the Rate_Limit_Window, THE Send_Service SHALL reject further compose requests using that Sender_Mailbox with a rate-limit error.
3. WHEN the Send_Service rejects a request due to a rate limit, THE Send_Service SHALL include the time after which the user may retry.

### Requirement 10: Delivery Feedback and Real-Time Updates

**User Story:** As an authorized user, I want to see the outcome of a send attempt, so that I know whether my message was delivered or failed.

#### Acceptance Criteria

1. WHEN the Send_Service accepts a compose request, THE Send_Service SHALL return a response identifying the created SentEmail_Store record and its current Delivery_Status.
2. WHEN the Delivery_Status of a SentEmail_Store record changes to `sent` or `failed`, THE Send_Service SHALL emit a real-time event to the sending user scoped to the Sender_Mailbox.
3. IF a compose request is rejected, THEN THE Send_Service SHALL return an error message that identifies the reason for rejection.

### Requirement 11: Outbound Delivery Mechanism

**User Story:** As a system operator, I want outbound messages delivered through a configured SMTP relay, so that messages reach external recipients reliably.

#### Acceptance Criteria

1. THE Outbound_Delivery_Agent SHALL deliver accepted messages to the SMTP relay identified by configuration.
2. IF required relay configuration is absent, THEN THE Send_Service SHALL reject compose requests with an error indicating outbound sending is not configured.
3. WHEN the Outbound_Delivery_Agent delivers a message, THE Outbound_Delivery_Agent SHALL set the message envelope sender to the Sender_Mailbox `emailAddress`.
4. IF the relay connection fails, THEN THE Send_Service SHALL set the SentEmail_Store record Delivery_Status to `failed` and SHALL record the connection failure reason.
