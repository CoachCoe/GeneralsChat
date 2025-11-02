# SAU 24 Policy Mapping & Upload Guide

This document maps the comprehensive policy framework to the system's policy types and provides upload instructions.

## Policy Upload Instructions

For each policy document:
1. Save the policy as a `.txt`, `.pdf`, or `.docx` file in `sample-policies/`
2. Use the upload script below
3. Match the `policyType` to the category

## Policy Categories

### 1. **Suicide Prevention** (`suicide_prevention`)
- JLDBB - Suicide Prevention
- SAU 24 Suicide Prevention Plan (2024)
- SAU 24 Crisis Response Team

### 2. **Title IX / Sexual Discrimination** (`title_ix`)
- ACAC - Prohibition of Sex Discrimination and Sex-Based Harassment ✅ Already uploaded
- Title IX Policy and Grievance Procedure

### 3. **Title VII / Discrimination** (`discrimination`)
- AC - Nondiscrimination, EOE, Anti-Discrimination Plan (2024)
- Anti-Discrimination Plan

### 4. **Mandatory Reporting** (`mandatory_reporting`)
- JLF - Reporting Child Abuse and Neglect (2019)
- DCYF Reporting Requirements
- Timelines and procedures

### 5. **Restraint and Seclusion** (`restraint_seclusion`)
- JKAA - Use of Restraint and Seclusion (2023)
- NH DOE Reporting requirements
- Documentation procedures

### 6. **Bullying** (`bullying`)
- JICK - Pupil Safety and Violence Prevention - Bullying (2013) ✅ Already uploaded
- JICDD - Cyberbullying (2018)
- Investigation procedures

### 7. **School Safety** (`school_safety`)
- MOU - Police Departments
- JIH - Searches of Students
- Safe Schools Reporting
- Emergency response procedures

### 8. **Student Conduct/Discipline** (`discipline`)
- JIC - Student Conduct (2021)
- JICD - Student Discipline and Due Process (2021)
- JICC - Student Conduct on School Buses ✅ Already uploaded
- JLDBA - Behavior Management and Intervention (2018)

### 9. **Student Health** (`student_health`)
- JLCD - Administering Medication (2018)
- JLCE - Emergency Care and First Aid
- HB 1088 - Epinephrine auto-injectors

### 10. **Sports/Athletic Injury** (`athletic_safety`)
- JLCJA - Emergency Plans for Sports Related Injury (2021)
- JLCJ - Concussions and Head Injuries (2015)
- Additional Protocols for Athletic Participation

### 11. **Student Records/FERPA** (`student_records`)
- JRA - Access to Educational Records (2012)
- FERPA - Annual notification
- JIAA - Students Right to Privacy (2006)

### 12. **Enrollment** (`enrollment`)
- JFAA - Admission of Resident Students (2017)
- JFAB - Admission of Non-Resident Students (2017)
- JFABD - Admission of Homeless Students (2017)
- JCA - Change of School Assignment (2023)

### 13. **Attendance/Truancy** (`attendance`)
- Truancy procedures
- Chronic absence protocols
- MTSS Team involvement

### 14. **Field Trips** (`field_trips`)
- EEAG - Use of Private Vehicles (2016)
- IJOA - Field Trips and Excursions (2024)
- Field Trip Procedures

### 15. **Emergency Operations** (`emergency_operations`)
- EBBC - Emergency Care and First Aid (2018)
- EBCA - Crisis Prevention and Emergency Response Plans (2020)
- Emergency Operations Plans (by school)
- Reunification Plan

### 16. **Technology/Cybersecurity** (`technology`)
- EHAB - Data Governance and Security (2023)
- Cybersecurity Plan
- GBEF-R - Acceptable Use

### 17. **Background Checks** (`background_checks`)
- GBCD - Background Investigations (2017)
- IJOC - Volunteers (2017)
- Criminal Background Check procedures

### 18. **Employee Policies** (`employee`)
- GCCBC - FMLA Leave (2020)
- Work Injury reporting
- EB - Joint Loss Management Committee (2021)

### 19. **Parental Rights** (`parental_rights`)
- IGE - Parental Objections to Course Material (2019)
- IHAM - Health Education Exemptions (2021)
- IJ - Selection of Curriculum Materials (2023)
- IJL - Library Resource Selection (2023)
- ILD - Non-Academic Surveys (2018)

### 20. **Chemical Safety** (`chemical_safety`)
- Chemical Safety Plan
- Chemical Hygiene procedures

## Quick Upload Script

Save this as `scripts/upload-policy-batch.ts`:

\`\`\`typescript
import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

config({ path: resolve(__dirname, '../.env') });

// Define your policies here
const policies = [
  {
    file: 'suicide-prevention-plan.pdf',
    title: 'JLDBB - Suicide Prevention Plan',
    type: 'suicide_prevention',
    effectiveDate: '2024-01-01'
  },
  {
    file: 'mandatory-reporting-jlf.pdf',
    title: 'JLF - Reporting Child Abuse and Neglect',
    type: 'mandatory_reporting',
    effectiveDate: '2019-01-01'
  },
  // Add more policies here...
];

async function uploadPolicies() {
  console.log(\`📚 Uploading \${policies.length} policies...\\n\`);

  for (const policy of policies) {
    try {
      const filePath = resolve(__dirname, '../sample-policies', policy.file);

      if (!fs.existsSync(filePath)) {
        console.log(\`⚠️  Skipping \${policy.file} (not found)\`);
        continue;
      }

      const form = new FormData();
      form.append('title', policy.title);
      form.append('policyType', policy.type);
      form.append('effectiveDate', policy.effectiveDate);
      form.append('file', fs.readFileSync(filePath), {
        filename: policy.file,
        contentType: policy.file.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
      });

      const response = await fetch('http://localhost:3001/api/policies', {
        method: 'POST',
        body: form as any,
        headers: form.getHeaders(),
      });

      if (response.ok) {
        console.log(\`✅ \${policy.title}\`);
      } else {
        console.log(\`❌ Failed: \${policy.title}\`);
      }
    } catch (error: any) {
      console.log(\`❌ Error uploading \${policy.title}: \${error.message}\`);
    }
  }

  console.log('\\n✅ Batch upload complete!');
}

uploadPolicies();
\`\`\`

## Required Forms Tracking

The system references these forms in guidance:
- DCYF Report
- Restraint/Seclusion Form
- Founded Bullying Investigation
- Safe Schools Report
- PowerSchool Log
- Accident Report
- Field Trip Permission
- Background Check forms
- FERPA Annual Notice
- Health Education Opt-Out
- State Testing Opt-Out

## Next Steps

1. **Save policy documents** as text/PDF files in `sample-policies/`
2. **Name consistently**: `policy-code-description.pdf` (e.g., `jlf-mandatory-reporting.pdf`)
3. **Run upload script** for each policy type
4. **Test in chat** - Ask about specific incidents to verify proper policy retrieval

## System Status

✅ **Currently Loaded:**
- Bullying Prevention (DISC-001)
- Student Conduct on School Buses (JICC)
- Title IX Policy Update (2025)

⏳ **Pending Upload:**
- 17+ policy categories from your comprehensive framework
- All related forms and procedures
- MOU documents with police departments
