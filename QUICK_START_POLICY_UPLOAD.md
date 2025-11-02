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
   npx tsx scripts/batch-upload-policies.ts
   ```

4. **Verify upload:**
   - Check the console output for success messages
   - Visit http://localhost:3002/policies to see uploaded policies

---

### Method 2: Single Policy Upload (Command Line)

**Best for:** Quick testing or single policy upload

```bash
curl -X POST http://localhost:3002/api/policies \
  -F "title=JLDBB - Suicide Prevention" \
  -F "policyType=suicide_prevention" \
  -F "effectiveDate=2024-01-01" \
  -F "file=@sample-policies/jldbb-suicide-prevention.pdf"
```

**Replace:**
- `title` → Your policy title
- `policyType` → One of the 20 policy types (see below)
- `effectiveDate` → YYYY-MM-DD format
- `file=@...` → Path to your policy file

---

### Method 3: Web UI Upload

**Best for:** Non-technical users or visual preference

1. Start the dev server (if not running):
   ```bash
   npm run dev
   ```

2. Navigate to: http://localhost:3002/policies

3. Click **"Upload Policy"** button

4. Fill in the form:
   - **Title:** Policy code and name
   - **Policy Type:** Select from dropdown
   - **Effective Date:** Use date picker
   - **File:** Click to upload PDF/DOCX/TXT

5. Click **"Submit"**

---

## 📋 Policy Type Reference

When uploading, use one of these **exact** policy type strings:

| Policy Type | Example Policies | Priority |
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
npx tsx scripts/verify-db.ts
```

Look for:
```
✓ Policy: X records
✓ PolicyChunk: Y records
```

### Option 2: Test in Chat
1. Go to http://localhost:3002/chat
2. Ask: "What does our policy say about [topic]?"
3. The chatbot should reference the uploaded policy

### Option 3: Prisma Studio
1. Open http://localhost:5555
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
- Check server is on correct port (3002 by default)
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

**Questions?** Check `SYSTEM_STATUS.md` for detailed system verification results.
