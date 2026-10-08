# Requirements Document

## Introduction

Docket is a full-stack web application that serves as a personal AI-powered document intelligence vault. Users upload documents (PDFs and images such as certificates, IDs, insurance papers, contracts, invoices, and warranties). The system automatically classifies each document and extracts structured key fields using an LLM. Users can browse, filter, and search their documents, ask natural-language questions about their document metadata, and receive automatic email and in-app alerts before documents expire.

The three core capabilities are:
1. **Ingestion pipeline** — upload → text extraction → AI classification and field extraction → stored structured record
2. **Retrieval** — full-text search (MongoDB $text index) plus a natural-language AI query bar using document metadata in a single prompt
3. **Proactive alerts** — scheduled daily job that checks expiry dates and notifies users via email and in-app notifications

## Glossary

- **System**: The Docket web application as a whole
- **Client**: The React frontend application
- **Server**: The Node.js/Express backend application
- **AuthService**: The component responsible for user registration, login, and JWT management
- **IngestionPipeline**: The async process that extracts text from uploaded files and calls the AI for classification and field extraction
- **AIService**: The adapter module (`server/services/aiService.js`) exposing `extractDocumentData`, `answerQuery`, and `extractTextFromImage`
- **SearchService**: The component that executes MongoDB `$text` queries against user documents
- **QueryService**: The component that handles natural-language AI queries against a user's document metadata
- **AlertService**: The scheduled cron job that checks expiry dates and sends notifications
- **Document**: A stored record representing an uploaded file with its extracted metadata
- **Notification**: An in-app alert record associated with a user and optionally a document
- **QueryLog**: A stored record of a user's natural-language question and the AI answer
- **User**: A registered account with email/password credentials
- **JWT**: A JSON Web Token used to authenticate API requests, valid for 7 days
- **Cloudinary**: The cloud file storage service used to store uploaded document files
- **Processing State**: A Document with `status: 'processing'` — text extraction and AI extraction are pending
- **Ready State**: A Document with `status: 'ready'` — all extraction completed successfully
- **Failed State**: A Document with `status: 'failed'` — extraction could not be completed after retry
- **alertsSent**: An array field on Document tracking which expiry thresholds have already triggered alerts (values: `'30day'`, `'7day'`, `'1day'`)
- **req.userId**: The user identifier attached to every request by `authMiddleware.js` from the verified JWT — the only userId trusted for database queries

---

## Requirements

### Requirement 1: User Registration

**User Story:** As a new visitor, I want to create an account with my name, email, and password, so that I can securely access my personal document vault.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/auth/register` with a valid name (1–100 characters, non-empty after trimming), a valid email address (RFC 5322 compliant), and a password of at least 8 characters, THE AuthService SHALL create a new User record with the password stored as a cryptographic hash and return a signed JWT valid for exactly 7 days along with the user's name and email.
2. IF a POST request is made to `/api/auth/register` with an email address that already exists in the database (case-insensitive match), THEN THE AuthService SHALL return an HTTP 409 response with an error message indicating the email is already registered.
3. IF a POST request is made to `/api/auth/register` with a missing or malformed email, a missing or empty name, or a password shorter than 8 characters, THEN THE AuthService SHALL return an HTTP 400 response with an error message identifying which field is invalid.
4. THE AuthService SHALL store the password as a hash with a work factor sufficient to prevent rapid brute-force attacks — the plaintext password SHALL NOT be persisted to the database at any point.
5. WHEN a User record is created, THE AuthService SHALL store the email address in lowercase regardless of the case supplied in the request.

---

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my documents and manage my vault.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/auth/login` with an email that matches a registered account (case-insensitive) and a password that matches the stored hash, THE AuthService SHALL return a signed JWT valid for exactly 7 days, along with the authenticated user's name and email.
2. IF a POST request is made to `/api/auth/login` with an email that does not match any registered account, or with a password that does not match the stored hash, THEN THE AuthService SHALL return an HTTP 401 response with a single generic error message that does not reveal whether the email or password was incorrect.
3. WHEN a GET request is made to `/api/auth/me` with a valid, unexpired Bearer JWT in the Authorization header, THE AuthService SHALL return the authenticated user's name and email.
4. IF a request is made to any protected route with a missing, malformed, or expired Bearer JWT, THEN THE Server SHALL return an HTTP 401 response before executing any route handler logic.

---

### Requirement 3: Frontend Authentication Flow

**User Story:** As a user, I want my login session to persist across browser refreshes and be enforced on protected pages, so that I do not have to log in repeatedly and unauthorized users cannot access my data.

#### Acceptance Criteria

1. WHEN the application initializes, THE Client SHALL read any JWT stored in localStorage and load it into the auth state store; IF no JWT is present, the auth state SHALL be set to unauthenticated.
2. WHEN a user logs in or registers successfully, THE Client SHALL store the returned JWT in localStorage, update the auth state store, and redirect the user to `/dashboard`.
3. WHEN a user who is not authenticated (no JWT present in auth state store or JWT is expired) attempts to access a protected route (`/dashboard`, `/documents`, `/notifications`, `/settings`), THE Client SHALL redirect them to `/login`.
4. WHILE a valid JWT is present in the auth state store, THE Client SHALL attach it as a Bearer token in the Authorization header of every outbound API request.
5. WHEN the Server returns an HTTP 401 response, THE Client SHALL remove the JWT from localStorage, clear the auth state store, and redirect the user to `/login`.
6. WHEN a user explicitly activates the logout action, THE Client SHALL remove the JWT from localStorage, clear the auth state store, and redirect to `/login`.
7. WHEN the application initializes and a JWT is found in localStorage but is expired, THE Client SHALL treat it as absent — remove it from localStorage, set auth state to unauthenticated, and redirect the user to `/login` if they are on a protected route.

---

### Requirement 4: Document Upload

**User Story:** As a user, I want to upload PDF and image files up to 15 MB, so that they are securely stored and queued for AI processing.

#### Acceptance Criteria

1. WHEN an authenticated POST request is made to `/api/documents` with a file attachment of type `application/pdf`, `image/jpeg`, `image/png`, or `image/webp` and a size of 15 MB or less, THE Server SHALL proceed with the upload.
2. IF a file larger than 15 MB is submitted, THEN THE Server SHALL return an HTTP 413 response before any file processing or storage begins.
3. IF a file of an unsupported MIME type is submitted, THEN THE Server SHALL return an HTTP 415 response with an error message specifying the rejected MIME type.
4. WHEN a valid file is received and stored successfully, THE Server SHALL create a Document record with `status: 'processing'` and `userId` set to the authenticated user's identity, and return an HTTP 202 response containing the new Document's identifier and status — all before any AI processing begins.
5. IF the file cannot be stored to the external file service, THEN THE Server SHALL return an HTTP 500 response and SHALL NOT create a Document record.
6. IF the request is made without a valid JWT or with an expired JWT, THEN THE Server SHALL return HTTP 401 before processing the file.
7. THE Client SHALL validate file size (maximum 15 MB) and MIME type client-side before submitting the upload request; IF validation fails, THE Client SHALL display an inline error message without submitting the request.
8. WHILE a file upload is in progress, THE Client SHALL display a progress indicator reflecting the current upload completion percentage.

---

### Requirement 5: Ingestion Pipeline — Text Extraction

**User Story:** As a user, I want text extracted from my uploaded documents, so that the AI has content to classify and analyze.

#### Acceptance Criteria

1. WHEN a PDF Document enters the Processing State, THE IngestionPipeline SHALL extract its text content and store a non-empty result in the Document's text field.
2. WHEN an image Document enters the Processing State, THE IngestionPipeline SHALL send the stored file URL to the AI vision endpoint and store a non-empty result in the Document's text field.
3. WHILE a Document is in the Processing State, THE Client SHALL poll the document status endpoint every 3 seconds, up to a maximum of 60 seconds, and stop polling when the Document transitions to Ready State or Failed State.
4. IF text extraction fails for any reason, THEN THE IngestionPipeline SHALL transition the Document to Failed State with a `failureReason` that identifies both the extraction step that failed (e.g., "PDF parsing" or "vision API call") and the underlying cause (e.g., "file is encrypted" or "API returned 503"), and SHALL create a `processing_failed` Notification for the user.
5. IF text extraction succeeds but yields an empty string, THEN THE IngestionPipeline SHALL transition the Document to Failed State with a `failureReason` of "No extractable text found in document" and SHALL create a `processing_failed` Notification for the user.

---

### Requirement 6: Ingestion Pipeline — AI Classification and Field Extraction

**User Story:** As a user, I want my documents automatically classified and key fields extracted, so that I do not have to manually tag and enter metadata.

#### Acceptance Criteria

1. WHEN extracted text is available for a Document in Processing State, THE IngestionPipeline SHALL request classification and field extraction from the AIService and expect a response containing: `documentType` (one of the valid enum values), `issuer` (string or null), `issueDate` (date string in YYYY-MM-DD format or null), `expiryDate` (date string in YYYY-MM-DD format or null), `amount` (number or null), and `suggestedTitle` (non-empty string).
2. IF the AI response matches the expected schema, THEN THE IngestionPipeline SHALL update the Document's `documentType`, `issuer`, `issueDate`, `expiryDate`, `amount`, and `title` (from `suggestedTitle`) fields, set `status` to `'ready'`, and create a `processing_complete` Notification for the user.
3. IF the AI response does not match the expected schema on the first attempt, THEN THE IngestionPipeline SHALL retry the extraction request exactly once using the same input text.
4. IF the AI response does not match the expected schema on the second attempt, THEN THE IngestionPipeline SHALL set the Document to Failed State with a `failureReason` of "AI extraction returned invalid data after retry" and create a `processing_failed` Notification for the user.
5. THE `documentType` field in any AI response SHALL be validated against the set: `id`, `certificate`, `contract`, `invoice`, `insurance`, `warranty`, `other`; any value outside this set SHALL be treated as a schema validation failure.
6. WHEN a Document transitions from Processing State to Ready State, THE Client SHALL display the newly extracted field values within 1 second of receiving the updated status, without requiring a full page reload.

---

### Requirement 7: Document Library — Browse and Filter

**User Story:** As a user, I want to browse my uploaded documents in a grid or list view with filters, so that I can quickly find a specific document by type or tag.

#### Acceptance Criteria

1. WHEN an authenticated GET request is made to `/api/documents`, THE Server SHALL return only the Documents belonging to the authenticated user, sorted by creation date descending, with a maximum of 50 documents per page.
2. THE Client SHALL render the document library at `/documents` with a toggle to switch between grid and list layouts; the selected layout SHALL be persisted in browser session storage and restored when the user returns to the page within the same session.
3. THE Client SHALL provide filter chips for each `documentType` value and for each tag present on any of the user's documents; WHEN one or more filter chips are active, THE Client SHALL display only documents matching at least one of the selected types or tags.
4. WHEN the document library contains no documents matching the active filters, THE Client SHALL display a message explaining that no documents match the current filters and providing an action to clear all filters.
5. WHILE documents are loading, THE Client SHALL display skeleton loading placeholders in place of document cards.
6. WHEN a document card is in Processing State, THE Client SHALL display a processing indicator on the card and prevent navigation to the document detail page until the document reaches Ready State or Failed State.
7. IF the request to load documents fails, THE Client SHALL display an error message and a button to retry the request.

---

### Requirement 8: Document Detail — View and Edit

**User Story:** As a user, I want to view and correct the AI-extracted fields on a document, so that I can ensure the metadata is accurate.

#### Acceptance Criteria

1. WHEN an authenticated GET request is made to `/api/documents/:id`, THE Server SHALL return the Document if and only if it belongs to the authenticated user; IF the document does not belong to the authenticated user or does not exist, THE Server SHALL return HTTP 404.
2. WHEN the user navigates to `/documents/:id`, THE Client SHALL render a split layout with a document preview panel on one side and an editable extracted-fields form on the other side.
3. WHEN an authenticated PATCH request is made to `/api/documents/:id` with a subset of updatable fields (title, issuer, issueDate, expiryDate, amount, tags), THE Server SHALL update only those fields, leave all other fields unchanged, and return the full updated Document; fields `userId`, `status`, `createdAt`, and `failureReason` SHALL NOT be modifiable via this endpoint.
4. IF a PATCH request is made to `/api/documents/:id` for a document that does not belong to the authenticated user, THEN THE Server SHALL return HTTP 404.
5. WHEN a user navigates to a document in Ready State where `reviewedByUser` is `false`, THE Client SHALL display a one-time review banner for that document prompting the user to verify the extracted fields; WHEN the user dismisses the banner, THE Client SHALL send a PATCH request setting `reviewedByUser: true` and SHALL NOT show the banner again for that document.
6. WHEN a user activates the delete action on a document, THE Client SHALL display a confirmation dialog; WHEN the user confirms, THE Client SHALL send a DELETE request; WHEN the user cancels, THE Client SHALL dismiss the dialog without sending any request.
7. WHEN an authenticated DELETE request is made to `/api/documents/:id`, THE Server SHALL delete the Document and its associated stored file only if the Document belongs to the authenticated user, and return HTTP 204; IF the document does not belong to the authenticated user, THE Server SHALL return HTTP 404.
8. WHILE a Document is in Failed State, THE Client SHALL display the failure reason and a retry button; WHEN the user activates the retry button, THE Client SHALL send a retry request and resume polling every 5 seconds, up to a maximum of 60 seconds.
9. WHEN an authenticated POST request is made to `/api/documents/:id/retry`, THE Server SHALL reset the Document to Processing State and re-trigger the IngestionPipeline, returning HTTP 202; IF the Document does not belong to the authenticated user, THE Server SHALL return HTTP 404.

---

### Requirement 9: Traditional Full-Text Search

**User Story:** As a user, I want to search my documents by keyword, so that I can quickly locate documents by name, issuer, or content.

#### Acceptance Criteria

1. THE Server SHALL maintain a full-text search index covering the document title, extracted text content, and issuer fields for the Document collection.
2. WHEN an authenticated search request is received with a query string of at least 2 characters, THE SearchService SHALL return only Documents belonging to the authenticated user whose title, extracted text, or issuer contain the query terms.
3. IF the search request includes a `type` filter parameter, THEN THE SearchService SHALL restrict results to Documents matching the specified document type.
4. IF the search request includes both a `type` filter and a `tag` filter, THEN THE SearchService SHALL restrict results to Documents matching both the specified document type and the specified tag simultaneously.
5. THE Client SHALL render a search input in the document library; WHEN the input contains text, THE Client SHALL display search results.
6. WHEN the user clears the search input, THE Client SHALL restore the full document list in place of search results, applying any active filter chips.
7. THE Client SHALL wait 300 ms after the user stops typing before sending a search request; a new keystroke within 300 ms SHALL reset the timer.
8. WHEN the search request returns zero results, THE Client SHALL display a message stating that no documents matched the query.

---

### Requirement 10: AI Natural-Language Query

**User Story:** As a user, I want to ask plain-English questions about my documents, so that I can instantly find answers without manually scanning each file.

#### Acceptance Criteria

1. WHEN an authenticated POST request is made to `/api/documents/query` with a non-empty `question` field, THE QueryService SHALL fetch all Documents in Ready State belonging to the authenticated user, collect their lightweight metadata (title, document type, issuer, issue date, expiry date, amount, tags), and pass the metadata and question to the AIService for answering.
2. THE QueryService SHALL return a response containing an answer string and an array of document identifiers that the answer is based on, derived solely from the authenticated user's own documents.
3. IF no metadata field directly addresses the question, THEN THE AIService SHALL return an answer stating that the information is not available in the user's documents; the answer SHALL NOT contain information inferred beyond the stored metadata.
4. THE QueryService SHALL NOT use embeddings, vector databases, LangChain, chunking, or any retrieval pipeline — the full metadata set SHALL be passed in a single prompt.
5. THE QueryService SHALL log the question, answer, and matched document identifiers as a QueryLog record associated with the authenticated user.
6. THE Client SHALL render an AI query input on the dashboard that accepts questions up to 500 characters; WHEN the user submits a question, THE Client SHALL display a loading indicator.
7. WHEN the answer is received, THE Client SHALL display the answer text in a visually distinct answer area, with each matched document title rendered as a clickable link to its detail page.
8. THE Client SHALL prevent submission of a question that is empty or contains only whitespace, displaying an inline validation message instead.
9. IF the authenticated user has no documents in Ready State, THE Client SHALL display a message explaining that documents must be uploaded and processed before questions can be answered.
10. IF the query request does not complete within 30 seconds, THE Client SHALL cancel the request, display an error message indicating a timeout, and allow the user to retry.

---

### Requirement 11: Expiry Alert System

**User Story:** As a user, I want to receive email and in-app notifications before my documents expire, so that I can renew them in time.

#### Acceptance Criteria

1. THE AlertService SHALL execute once per day at 08:00 UTC.
2. WHEN the AlertService runs, THE AlertService SHALL identify all Documents in Ready State with an expiry date between 0 and 30 calendar days from the current UTC date (inclusive).
3. FOR each Document identified, THE AlertService SHALL evaluate whether each of the three alert thresholds (30 days, 7 days, and 1 day before expiry) applies based on the number of calendar days remaining, and for each applicable threshold that has not yet been recorded as sent, THE AlertService SHALL send an alert email to the document owner's registered address and create an in-app expiry alert Notification.
4. WHEN an alert is sent for a Document at a given threshold, THE AlertService SHALL record that threshold as sent on the Document so that the same threshold alert is never sent again for that Document.
5. IF either the email send or the Notification creation fails for a given Document, THEN THE AlertService SHALL log the error with the Document identifier and threshold, and SHALL continue processing the remaining Documents without interruption.
6. THE AlertService SHALL evaluate all three thresholds independently per Document, so a document may receive up to three distinct alerts as its expiry date approaches.

---

### Requirement 12: In-App Notification Centre

**User Story:** As a user, I want to view all my in-app notifications in one place and mark them as read, so that I stay informed about document processing and expiry.

#### Acceptance Criteria

1. WHEN an authenticated GET request is made to `/api/notifications`, THE Server SHALL return all Notifications belonging to the authenticated user, sorted by creation date descending; IF the optional `unreadOnly=true` query parameter is present, THE Server SHALL return only Notifications where `read` is `false`.
2. WHEN an authenticated PATCH request is made to `/api/notifications/:id/read`, THE Server SHALL set the Notification's `read` field to `true` and return the updated Notification, only if the Notification belongs to the authenticated user; IF it does not, THE Server SHALL return HTTP 404.
3. WHEN an authenticated PATCH request is made to `/api/notifications/mark-all-read`, THE Server SHALL set `read` to `true` on all Notifications belonging to the authenticated user and return a count of Notifications updated.
4. THE Client SHALL display a badge on the notification bell icon in the navigation bar showing the count of unread Notifications; WHEN the unread count reaches zero, THE Client SHALL remove the badge.
5. THE Client SHALL render the full notification list at `/notifications` with the ability to filter by notification type; WHEN a type filter is active, THE Client SHALL display only Notifications of that type.
6. WHEN a user activates a notification in the list that is associated with a Document, THE Client SHALL navigate to that document's detail page.
7. WHILE Notifications are loading, THE Client SHALL display skeleton loading placeholders in place of notification items.

---

### Requirement 13: Dashboard

**User Story:** As a user, I want a dashboard summarising my document vault at a glance, so that I can immediately see what needs attention.

#### Acceptance Criteria

1. WHEN the dashboard route is loaded, THE Client SHALL request summary statistics from the Server and display: total document count, document count by processing status, count of documents expiring within 30 days, and count of unread notifications.
2. WHEN the dashboard route is loaded, THE Client SHALL request and render a chart showing document counts grouped by document type using the summary statistics from the Server.
3. THE Client SHALL render an expiring-soon widget listing up to 10 Documents with an expiry date within 30 days, sorted by expiry date ascending, with each entry showing the document title, expiry date, and a link to the document detail page.
4. THE Client SHALL render a recent-activity list showing the 5 most recently created or updated Documents, sorted by the later of their creation date and last-updated date descending.
5. THE Client SHALL render the AI query bar on the dashboard as described in Requirement 10.
6. WHEN a GET request is made to `/api/dashboard/stats` with a valid JWT, THE Server SHALL return a JSON object containing: total document count, per-status document counts, count of documents with expiry date within 30 days, count of unread notifications, per-type document counts, and the 5 most recently updated document summaries — all scoped to the authenticated user.
7. IF the request to `/api/dashboard/stats` fails, THE Client SHALL display an error message with a retry button in place of the affected dashboard widgets.

---

### Requirement 14: Settings Page

**User Story:** As a user, I want to manage my profile, change my password, toggle dark/light mode, and delete my account, so that I have full control over my account and preferences.

#### Acceptance Criteria

1. THE Client SHALL render the settings page at `/settings` with four distinct sections: profile editing, password change, appearance (dark/light mode toggle), and account deletion.
2. WHEN a user submits updated profile fields (name or email), THE Client SHALL send a PATCH request to the profile update endpoint; WHEN the Server returns success, THE Client SHALL display a success confirmation message; IF the Server returns an error (e.g., email already in use), THE Client SHALL display the error message inline.
3. WHEN a user submits the password change form with a current password and a new password of at least 8 characters, THE Server SHALL verify the current password matches the stored hash; IF it matches, THE Server SHALL update the stored hash and return HTTP 200; IF it does not match, THE Server SHALL return HTTP 401.
4. IF the new password submitted in the password change form is shorter than 8 characters, THEN THE Client SHALL display a validation error and SHALL NOT submit the request.
5. WHEN a user activates the account deletion action, THE Client SHALL display a confirmation dialog requiring the user to type their registered email address exactly before the delete button becomes enabled.
6. WHEN account deletion is confirmed with the correct email, THE Server SHALL delete the User record and all associated Documents, Notifications, and QueryLogs belonging to that user, and return HTTP 200; THE Client SHALL then clear auth state, remove the JWT from localStorage, and redirect to `/login`.
7. IF account deletion fails on the Server, THE Client SHALL display an error message without clearing auth state or redirecting.
8. WHEN the application initializes without a previously stored theme preference, THE Client SHALL default to the system's preferred color scheme (light or dark); thereafter, THE Client SHALL persist any explicit user selection in localStorage and apply it on all subsequent startups.
9. WHILE dark mode is active, THE Client SHALL apply dark-mode styling classes to all pages and components.

---

### Requirement 15: Security and Data Isolation

**User Story:** As a user, I want assurance that I can only ever access my own documents and data, so that my private information is protected.

#### Acceptance Criteria

1. THE Server SHALL derive the authenticated user's identity for all database operations exclusively from the verified JWT attached to the request — any user identifier supplied in the request body or query parameters SHALL be ignored for filtering purposes.
2. EVERY database query on the Document, Notification, and QueryLog collections SHALL include a filter restricting results to records owned by the authenticated user.
3. WHEN a request attempts to access a Document, Notification, or QueryLog record that does not belong to the authenticated user, THE Server SHALL return HTTP 404 rather than HTTP 403.
4. THE Server SHALL require a valid JWT for all routes that access Document, Notification, or user-specific data; IF no valid JWT is present, THE Server SHALL return HTTP 401 before executing any handler logic.
5. THE AIService SHALL receive only the document-level attributes (title, type, issuer, dates, amount, tags) belonging to the authenticated user's own documents — no content or metadata from any other user SHALL be included in any prompt.
6. WHEN an unauthenticated request is made to any protected route, THE Server SHALL return HTTP 401 without revealing whether the requested resource exists.

---

### Requirement 16: UI Foundations — States, Animations, and Accessibility

**User Story:** As a user, I want a polished, responsive interface with clear feedback for every action, so that the application feels reliable and is easy to use.

#### Acceptance Criteria

1. WHILE any list or data-fetch operation is in progress, THE Client SHALL display skeleton loading placeholders shaped to match the expected content layout.
2. WHEN any list or data-fetch operation fails, THE Client SHALL display an error message identifying what failed and a button that retries the same request when activated.
3. WHEN any list contains no items (after a successful fetch returning zero results), THE Client SHALL display a message explaining why the list is empty and providing a relevant next action (e.g., a link or button to upload a document).
4. THE Client SHALL apply the following Framer Motion animations: a fade transition on route change (duration ≤ 300 ms), a stagger fade-in for list items when the list first mounts (delay ≤ 50 ms per item), a scale-and-fade on modal open and close (duration ≤ 200 ms), a visible animated transition when a document card moves from Processing State to Ready State, and a slide-in for toast notifications from the bottom-right corner.
5. THE Client SHALL render all pages without horizontal overflow on viewport widths from 375 px to 1920 px.
6. THE Client SHALL load Inter as the primary typeface and apply one designated accent color to all primary action buttons, active state indicators, and the AI query bar border.
7. ALL interactive elements SHALL have a focus indicator with a minimum contrast ratio of 3:1 against the adjacent background color, and a hover state that is visually distinct from the default state, in both light and dark modes.
8. WHEN a user action produces a transient result (e.g., save success, copy to clipboard, form submission error that does not block navigation), THE Client SHALL display a toast notification using `react-hot-toast` that auto-dismisses after 4 seconds.
