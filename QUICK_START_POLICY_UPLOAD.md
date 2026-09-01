# Quick Start: Policy Upload Guide

## 🚀 Three Ways to Upload Policies

### Method 1: Batch Upload Script (RECOMMENDED)

**Best for:** Uploading multiple policies at once

1. **Save your policy files** to `sample-policies/` directory:
   ```bash
   sample-policies/
   ├── jldbb-suicide-prevention.pdf
   ├── jlf-mandatory-reporting.pdf
   ├── jkaa-restraint-seclusion.pdf
   └── ...
   ```

2. **Edit the batch script** at `scripts/batch-upload-policies.ts`:
   - Uncomment the policies you want to upload
   - OR add new policy definitions following the template

3. **Run the script:**
   ```bash
   npm run policies:batch-upload
   ```

4. **Verify upload:**
   - Check the console output for success messages
   - Visit http://localhost:3000/policies to see uploaded policies

---

### Method 2: Single Policy Upload (Command Line)

**Best for:** loading one policy, and the path that actually works today.

Use `npm run policies:load`. It writes through Prisma, so it needs no running
server and no session cookie, it accepts `.pdf` and `.docx` as well as text,
and it **dry-runs by default** — you see what it would create before it writes.

```bash
npm run policies:load -- \
  --file sample-policies/jldbb-suicide-prevention.pdf \
  --title "JLDBB - Suicide Prevention" \
  --jurisdiction district \
  --category suicide_prevention \
  --effective 2024-01-01
# then repeat with --apply to write
```

**Replace:**
- `--title` → Your policy title
- `--jurisdiction` → `federal`, `state`, `district` or `school` (see below)
- `--category` → one of the 20 categories (see below); it is validated, and a
  typo is rejected rather than stored as `other`
- `--effective` → YYYY-MM-DD format
- `--file` → Path to your policy file

It refuses a document from which fewer than 50 words could be extracted, which
is what a scanned PDF looks like.

`POST /api/policies` used to be documented here. It is gone: it was the third
of three ingestion routes, called by nothing, and it sat outside the
`/api/admin` prefix that the middleware gates. The HTTP path is now
`POST /api/admin/policies/upload`, which the admin UI uses.

---

### Method 3: Web UI Upload

**Best for:** Non-technical users or visual preference

1. Start the dev server (if not running):
   ```bash
   npm run dev
   ```

2. Navigate to: http://localhost:3000/policies

3. Click **"Upload Policy"** button

4. Fill in the form:
   - **Title:** Policy code and name
   - **Policy Type:** Select from dropdown
   - **Effective Date:** Use date picker
   - **File:** Click to upload PDF/DOCX/TXT

5. Click **"Submit"**

---

## 📋 Policy Reference

Every policy has **two** independent fields.

### Jurisdiction — who issued it

| Value | Meaning |
|---|---|
| `federal` | Federal law or regulation (Title IX, FERPA, IDEA) |
| `state` | State statute or department rule (e.g. NH RSA 193-F) |
| `district` | SAU / district board policy |
| `school` | Individual school procedure or handbook |

Federal and state set the floor; district and school implement it. Guidance
assembles all of them, so an administrator sees both the statutory requirement
and the local procedure that satisfies it.

**If a category has no district or school policy, the assistant says so**
rather than presenting a federal or state rule as local procedure. That gap is
worth knowing about — there should be a local policy for everything.

### Category — what it covers

Incident classification matches on this to decide which policies apply. Use one
of these **exact** strings:

| Category | Example Policies | Priority |
|------------|------------------|----------|
| `suicide_prevention` | JLDBB - Suicide Prevention | 🔴 High |
| `mandatory_reporting` | JLF - Reporting Child Abuse and Neglect | 🔴 High |
| `restraint_seclusion` | JKAA - Use of Restraint and Seclusion | 🔴 High |
| `title_ix` | ACAC - Prohibition of Sex Discrimination | 🟠 Medium |
| `discrimination` | AC - Nondiscrimination, EOE | 🟠 Medium |
| `bullying` | JICK - Bullying Prevention, JICDD - Cyberbullying | 🟠 Medium |
| `school_safety` | MOU - Police Departments, JIH - Searches | 🟠 Medium |
| `emergency_operations` | EBCA - Crisis Prevention and Emergency Response | 🟠 Medium |
| `discipline` | JIC - Student Conduct, JICC - Bus Conduct | 🟡 Standard |
| `student_health` | JLCD - Administering Medication | 🟡 Standard |
| `athletic_safety` | JLCJA - Sports Related Injury | 🟡 Standard |
| `student_records` | JRA - Access to Educational Records (FERPA) | 🟡 Standard |
| `enrollment` | JFAA - Admission of Resident Students | 🟢 Low |
| `attendance` | Truancy procedures | 🟢 Low |
| `field_trips` | IJOA - Field Trips and Excursions | 🟢 Low |
| `technology` | EHAB - Data Governance and Security | 🟢 Low |
| `background_checks` | GBCD - Background Investigations | 🟢 Low |
| `employee` | GCCBC - FMLA Leave | 🟢 Low |
| `parental_rights` | IGE - Parental Objections to Course Material | 🟢 Low |
| `chemical_safety` | Chemical Safety Plan | 🟢 Low |

---

## 📁 Supported File Formats

- **PDF** (`.pdf`) - Most common, best for scanned documents
- **Word** (`.docx`) - Best for editable documents
- **Text** (`.txt`) - Simplest format, best for copy-paste

**File size limit:** 10MB per file

---

## ✅ Verify Upload Success

### Option 1: Check Database
```bash
npm run db:verify
```

Look for:
```
✓ Policy: X records
✓ PolicyChunk: Y records
```

### Option 2: Test in Chat
1. Go to http://localhost:3000/chat
2. Ask: "What does our policy say about [topic]?"
3. The chatbot should reference the uploaded policy

### Option 3: Prisma Studio
1. Run `npm run db:studio`, then open http://localhost:5555
2. Click "Policy" table
3. View all uploaded policies and their chunks

---

## 🎯 Recommended Upload Order

### Phase 1: Critical Safety & Legal (Upload Today)
1. Suicide Prevention (JLDBB)
2. Mandatory Reporting (JLF) - DCYF requirements
3. Restraint and Seclusion (JKAA)

### Phase 2: Compliance & Safety (This Week)
4. Title IX (if not already uploaded)
5. Discrimination (AC)
6. Bullying & Cyberbullying (JICK, JICDD)
7. School Safety (MOU, JIH)
8. Emergency Operations (EBCA, EBBC)

### Phase 3: Student Conduct & Health (Next Sprint)
9. Student Conduct (JIC, JICD)
10. Student Health (JLCD, JLCE)
11. Sports/Athletic Injury (JLCJA, JLCJ)
12. Student Records/FERPA (JRA, JIAA)

### Phase 4: Administrative Procedures (As Needed)
13. Enrollment (JFAA, JFAB, JFABD, JCA)
14. Attendance/Truancy
15. Field Trips (EEAG, IJOA)
16. Technology/Cybersecurity (EHAB)
17. Background Checks (GBCD, IJOC)
18. Employee Policies (GCCBC, EB)
19. Parental Rights (IGE, IHAM, IJ, IJL, ILD)
20. Chemical Safety

---

## 🐛 Troubleshooting

### "File not found" error
- Verify file is in `sample-policies/` directory
- Check filename spelling matches exactly
- Ensure file extension is correct (.pdf, .docx, .txt)

### "Invalid file type" error
- Only PDF, DOCX, and TXT files are supported
- Convert other formats to one of these

### "Credit balance too low" error
- OpenAI embeddings require API credits
- Add credits at https://platform.openai.com/account/billing
- **Note:** Can still upload without embeddings (uses keyword search fallback)

### "API error" or "Network error"
- Verify dev server is running: `npm run dev`
- Check server is on correct port (3000 by default)
- Ensure .env file has required API keys

### Policy uploaded but not appearing in chat
- Check vector database connection (Chroma)
- Verify embeddings were created (needs OpenAI API key)
- Try keyword search fallback by asking directly about policy code (e.g., "Tell me about JLDBB")

---

## 📊 Current System Status

**Policies Loaded:** 3 main policies (7 total records)
- ✅ DISC-001 - Bullying Prevention
- ✅ JICC - Student Conduct on School Buses
- ✅ ACAC - Title IX Policy Update 2025

**Policies Pending:** 17+ categories (see POLICY_MAPPING.md)

**System Ready:** ✅ Yes
**RAG Working:** ✅ Yes
**Chat Working:** ✅ Yes
**Production Build:** ✅ Clean

---

## 🎉 You're Ready!

The system is fully operational and ready to accept more policies. Just:
1. Save your policy files to `sample-policies/`
2. Run the batch upload script (or use UI/command line)
3. Test in chat to verify policies are being used

**Questions?** See the [README](README.md) for the current setup, architecture and
security status. Dated snapshots from November 2025 are in `docs/history/`.
