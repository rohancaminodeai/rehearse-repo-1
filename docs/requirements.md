# Requirements — InBody Dashboard

What the product does and for whom, independent of technology. Stack lives in
[`technical-decisions.md`](technical-decisions.md); shape lives in [`architecture.md`](architecture.md).
Keep the MVP small and honest: **if it is not listed here, it is not in scope.**

## 1. Problem

Personal trainers receive customers' InBody body-composition result sheets (photos) and currently send
them back one-by-one over chat apps with a comment. There is no central place to store them, so results
are scattered, hard to manage, and chat storage fills up. Trainers want one place to upload, comment on,
and share each customer's results; customers want a simple private place to view them and respond.

## 2. Personas

### 2.1 Trainer — *Coach Park*
- Runs a PT studio, manages ~10–30 customers grouped by month ("this month's diet pot").
- Uploads each customer's InBody photo, writes a short comment, shares it privately with that customer.
- Moderate tech comfort; uses the app several times a week.

### 2.2 Customer — *Minsu*
- Trains with Coach Park; wants to see their InBody results and the coach's comment.
- Uses the app a few times a month, briefly; low tolerance for friction.
- Has no email account in the system — logs in with a name + password the trainer sets.

## 3. User stories

### Trainer
- **T1** As a trainer, I can sign up and sign in, so my data is private to me.
- **T2** As a trainer, I can create a group (e.g. a monthly diet pot), so I can organize customers.
- **T3** As a trainer, I can add a customer to a group with a name and an access password, so they can
  later log into their own portal.
- **T4** As a trainer, I can edit or remove a customer.
- **T5** As a trainer, I can upload a customer's InBody result image and write a comment.
- **T6** As a trainer, I can preview (modal), download, edit the comment on, and delete an entry.
- **T7** As a trainer, I can copy a customer's portal login link to share it.

### Customer
- **C1** As a customer, I can open my trainer's portal link and sign in with my name + password.
- **C2** As a customer, I land on my InBody dashboard and see only my own results.
- **C3** As a customer, I can preview and download my InBody images.
- **C4** As a customer, I can react to the trainer's comment with a single emoji.

## 4. Functional requirements (MVP)

### 4.1 Auth
- **FR-1** Trainer email + password sign-up and sign-in; passwords stored hashed (NFR-1).
- **FR-2** Trainer sign-out.
- **FR-3** Each trainer has a unique URL slug used for their customer portal link.
- **FR-4** Customer sign-in via a trainer-scoped portal: trainer slug + customer name + password.
  Name is matched normalized (trimmed, case-insensitive). Wrong name or password → one generic error.
- **FR-5** Customer sign-out.

### 4.2 Groups & customers
- **FR-6** A trainer can create a group (name, optional note).
- **FR-7** A trainer can add a customer (name + access password) **into a group**. A customer belongs
  to exactly one group; a customer cannot be created without a group.
- **FR-8** Customer name is unique within a trainer (normalized).
- **FR-9** A trainer can edit a customer (name, reset password, move group) and delete a customer.
  Deleting a customer removes their InBody entries and the stored image objects.

### 4.3 InBody module
- **FR-10** A trainer can upload an InBody result image for a customer (JPG/PNG/WebP/HEIC). HEIC is
  converted to JPEG on upload so it always previews.
- **FR-11** An entry has an optional trainer **comment** (single text field, editable).
- **FR-12** A trainer can preview an entry in a modal, download the image, edit the comment, and
  delete the entry (removing the stored object).
- **FR-13** A customer can preview and download their own entries (read-only; cannot upload/delete).

### 4.4 Reactions
- **FR-14** A customer can set one emoji reaction on an entry's comment. Re-selecting the same emoji
  removes it; a different emoji replaces it (one reaction per entry).
- **FR-15** The trainer sees the customer's reaction on the entry.

## 5. Non-functional requirements

- **NFR-1** Passwords stored as bcrypt hashes (cost ≥ 10). Trainer and customer alike.
- **NFR-2** All mutations authorized server-side; client checks are UX only.
- **NFR-3** A user can only read/modify data in their own scope (trainer→their customers,
  customer→their entries). Cross-account leakage is a **P0** bug. Images never served by public URL.
- **NFR-4** Sessions are signed JWTs in httpOnly cookies; secrets from env.
- **NFR-5** Uploaded images validated by type and size (≈10 MB max) server-side.
- **NFR-6** Responsive down to 360 px; latest two versions of evergreen browsers.
- **NFR-7** Every screen has a sensible empty state and error state.

## 6. Out of scope for MVP (deferred — not rejected)

| Excluded | Why |
| --- | --- |
| **AI analysis report** + `@AI 요약 삽입` | Needs Claude API + vision; placeholder UI only for now. |
| **Structured metrics & charts** (체지방률 추이, stat cards) | Needs numeric data model; MVP is **images only**. |
| **Two-way comment thread** | MVP is a single trainer comment + one customer emoji reaction. |
| **Right-hand 상세 panel, 측정 회차/주차, status workflow** | Organizational complexity not needed to validate. |
| Customer self-signup / email | Customers are created by the trainer; no email per customer. |
| Multi-trainer per customer, multi-group per customer | One trainer, one group per customer. |
| Real-time, notifications, payments, OCR | Not part of the wedge. |

## 7. Success criteria

- A trainer can go signup → group → customer → upload (incl. a HEIC photo) → comment → share link.
- A customer can log in via the link and view/download results and react — seeing only their own data.
- Zero cross-account data-leak incidents.
