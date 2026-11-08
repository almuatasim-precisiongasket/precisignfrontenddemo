// Field and option inventory transcribed from PR#26-RND01. IDs match the supplied reference.
export const RND_FORM = "R&D Initiative" as const;
export const rndGroups = [
  {
    "id": "q3Freq",
    "sideContainer": "sideQ3Freq",
    "docContainer": "docQ3Freq",
    "singleSelect": true,
    "options": [
      "Daily",
      "Several times a week",
      "Weekly",
      "Monthly",
      "Occasionally",
      "One-time",
      "Other:"
    ]
  },
  {
    "id": "q3Rec",
    "sideContainer": "sideQ3Rec",
    "docContainer": "docQ3Rec",
    "singleSelect": true,
    "options": [
      "Yes",
      "No",
      "Not sure"
    ]
  },
  {
    "id": "q4Dur",
    "sideContainer": "sideQ4Dur",
    "docContainer": "docQ4Dur",
    "singleSelect": true,
    "options": [
      "Less than a month",
      "1–6 months",
      "6–12 months",
      "More than a year",
      "Not sure"
    ]
  },
  {
    "id": "q5Areas",
    "sideContainer": "sideQ5Areas",
    "docContainer": "docQ5Areas",
    "singleSelect": false,
    "options": [
      "Operational costs",
      "Production delays",
      "Productivity",
      "Quality / Rework",
      "Material wastage",
      "Equipment downtime",
      "Manpower dependency",
      "Manual / Repetitive work",
      "Customer complaints",
      "Safety",
      "Documentation / Reporting",
      "Business opportunities",
      "Other:"
    ]
  },
  {
    "id": "q8Mkt",
    "sideContainer": "sideQ8Mkt",
    "docContainer": "docQ8Mkt",
    "singleSelect": true,
    "options": [
      "Yes",
      "No",
      "Not sure"
    ]
  },
  {
    "id": "q9Barriers",
    "sideContainer": "sideQ9Barriers",
    "docContainer": "docQ9Barriers",
    "singleSelect": false,
    "options": [
      "Too expensive",
      "Does not meet requirements",
      "Difficult to integrate",
      "Requires process changes",
      "Requires specialised manpower / training",
      "Unsuitable operating environment",
      "Maintenance / Support limitations",
      "Data security concerns",
      "Not yet evaluated",
      "Other:"
    ]
  },
  {
    "id": "q10Prev",
    "sideContainer": "sideQ10Prev",
    "docContainer": "docQ10Prev",
    "singleSelect": true,
    "options": [
      "Yes",
      "No",
      "Not sure"
    ]
  },
  {
    "id": "q11Prop",
    "sideContainer": "sideQ11Prop",
    "docContainer": "docQ11Prop",
    "singleSelect": true,
    "options": [
      "Yes",
      "No",
      "Need technical assistance"
    ]
  },
  {
    "id": "q12Goals",
    "sideContainer": "sideQ12Goals",
    "docContainer": "docQ12Goals",
    "singleSelect": false,
    "options": [
      "Reduce cost",
      "Save time",
      "Improve quality",
      "Increase productivity",
      "Reduce manpower dependency",
      "Automate processes",
      "Improve safety / accuracy",
      "Develop a new product or service",
      "Other:"
    ]
  },
  {
    "id": "q13Domains",
    "sideContainer": "sideQ13Domains",
    "docContainer": "docQ13Domains",
    "singleSelect": false,
    "options": [
      "AI",
      "Automation / Robotics",
      "Software Development",
      "Mechanical / Engineering Development",
      "New Equipment / Technology",
      "Process Improvement",
      "Data Analytics",
      "Academic Research",
      "Not sure"
    ]
  },
  {
    "id": "fAttach",
    "sideContainer": "sideFAttach",
    "docContainer": "docFAttach",
    "singleSelect": false,
    "options": [
      "Photographs / Videos",
      "Drawings / Technical Documents",
      "Process Flowcharts",
      "Reports / Historical Records",
      "Cost Estimates",
      "Other:"
    ]
  },
  {
    "id": "hVerified",
    "sideContainer": "sideHVerified",
    "docContainer": "docHVerified",
    "singleSelect": true,
    "options": [
      "Yes",
      "No",
      "Further Information Required"
    ]
  },
  {
    "id": "hRecurring",
    "sideContainer": "sideHRecurring",
    "docContainer": "docHRecurring",
    "singleSelect": true,
    "options": [
      "Yes",
      "No",
      "To Be Confirmed"
    ]
  },
  {
    "id": "hImpact",
    "sideContainer": "sideHImpact",
    "docContainer": "docHImpact",
    "singleSelect": true,
    "options": [
      "High",
      "Medium",
      "Low"
    ]
  },
  {
    "id": "hFeas",
    "sideContainer": "sideHFeas",
    "docContainer": "docHFeas",
    "singleSelect": true,
    "options": [
      "High",
      "Medium",
      "Low",
      "Pending"
    ]
  },
  {
    "id": "hMkt",
    "sideContainer": "sideHMkt",
    "docContainer": "docHMkt",
    "singleSelect": true,
    "options": [
      "Available",
      "Not Identified",
      "Further Research"
    ]
  },
  {
    "id": "hApproach",
    "sideContainer": "sideHApproach",
    "docContainer": "docHApproach",
    "singleSelect": false,
    "options": [
      "Internal Solution",
      "University Collaboration",
      "External Vendor",
      "Further Study"
    ]
  },
  {
    "id": "hPriority",
    "sideContainer": "sideHPriority",
    "docContainer": "docHPriority",
    "singleSelect": true,
    "options": [
      "High",
      "Medium",
      "Low"
    ]
  },
  {
    "id": "hDecision",
    "sideContainer": "sideHDecision",
    "docContainer": "docHDecision",
    "singleSelect": true,
    "options": [
      "Validate",
      "Hold",
      "Reject",
      "More Information Required"
    ]
  }
] as const;
export const rndSections = [
  {
    "id": "A",
    "title": "A. Submission Details",
    "items": [
      {
        "kind": "text",
        "id": "inpSubRef",
        "label": "Submission Reference No.",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpSubDate",
        "label": "Date of Submission",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpCompany",
        "label": "Company / Division",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpDept",
        "label": "Department",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpEmpName",
        "label": "Employee Name & Designation",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpContact",
        "label": "Contact Details",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpProbTitle",
        "label": "Problem Title",
        "multiline": false
      }
    ]
  },
  {
    "id": "B",
    "title": "B. Problem Description (Q1 – Q4)",
    "items": [
      {
        "kind": "text",
        "id": "inpQ1",
        "label": "1. Describe the problem or challenge",
        "multiline": true
      },
      {
        "kind": "text",
        "id": "inpQ2",
        "label": "2. Describe an actual scenario or recent example",
        "multiline": true
      },
      {
        "kind": "choice",
        "id": "q3Freq",
        "label": "3. Frequency"
      },
      {
        "kind": "text",
        "id": "inpQ3FreqOther",
        "label": "Other frequency (if applicable)",
        "multiline": false
      },
      {
        "kind": "choice",
        "id": "q3Rec",
        "label": "Recurring?"
      },
      {
        "kind": "text",
        "id": "inpQ3Occur",
        "label": "Approx. no. of occurrences",
        "multiline": false
      },
      {
        "kind": "choice",
        "id": "q4Dur",
        "label": "4. How long has the problem existed?"
      }
    ]
  },
  {
    "id": "C",
    "title": "C. Business Impact (Q5 – Q6)",
    "items": [
      {
        "kind": "choice",
        "id": "q5Areas",
        "label": "5. What areas are affected? (Select all applicable)"
      },
      {
        "kind": "text",
        "id": "inpQ5Other",
        "label": "Other affected area...",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpImpTime",
        "label": "Time lost / frequency",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpImpManpower",
        "label": "Manpower involved",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpImpFinance",
        "label": "Financial impact",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpImpProd",
        "label": "Production / delivery impact",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpImpOther",
        "label": "Other measurable impact",
        "multiline": false
      }
    ]
  },
  {
    "id": "D",
    "title": "D. Existing Solutions & Market Research (Q7 – Q10)",
    "items": [
      {
        "kind": "text",
        "id": "inpQ7",
        "label": "7. How is the problem currently managed or addressed?",
        "multiline": true
      },
      {
        "kind": "choice",
        "id": "q8Mkt",
        "label": "8. Are ready-made solutions available in the market?"
      },
      {
        "kind": "market",
        "id": "marketRows",
        "label": "Market solutions"
      },
      {
        "kind": "choice",
        "id": "q9Barriers",
        "label": "9. If solutions exist, why are they not being adopted?"
      },
      {
        "kind": "text",
        "id": "inpQ9Other",
        "label": "Other reason...",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpQ9Exp",
        "label": "Explanation...",
        "multiline": true
      },
      {
        "kind": "choice",
        "id": "q10Prev",
        "label": "10. Have previous solutions been attempted?"
      },
      {
        "kind": "text",
        "id": "inpQ10Exp",
        "label": "If yes, explain what was tried and the outcome...",
        "multiline": true
      }
    ]
  },
  {
    "id": "E",
    "title": "E. Proposed Solution & Improvement (Q11 – Q13)",
    "items": [
      {
        "kind": "choice",
        "id": "q11Prop",
        "label": "11. Do you have a proposed solution or improvement idea?"
      },
      {
        "kind": "text",
        "id": "inpQ11Desc",
        "label": "If yes, describe it...",
        "multiline": true
      },
      {
        "kind": "choice",
        "id": "q12Goals",
        "label": "12. What should an ideal solution achieve?"
      },
      {
        "kind": "text",
        "id": "inpQ12Other",
        "label": "Other goal...",
        "multiline": false
      },
      {
        "kind": "choice",
        "id": "q13Domains",
        "label": "13. Which areas could help solve this problem?"
      }
    ]
  },
  {
    "id": "F",
    "title": "F & G. Supporting Info & Confirmation",
    "items": [
      {
        "kind": "choice",
        "id": "fAttach",
        "label": "F. Available attachments:"
      },
      {
        "kind": "text",
        "id": "inpFOther",
        "label": "Other attachment...",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpGSubBy",
        "label": "G. Submitted By",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpGDate",
        "label": "Date",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpGSigText",
        "label": "Submitter Signature (Typed or Image/Draw)",
        "multiline": false
      }
    ]
  },
  {
    "id": "H",
    "title": "H. R&D Team Evaluation – Internal Use Only",
    "items": [
      {
        "kind": "text",
        "id": "inpHRefDate",
        "label": "Problem Reference No. / Review Date",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpHEvalBy",
        "label": "Evaluated By",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpHDeptHead",
        "label": "Relevant Department Head",
        "multiline": false
      },
      {
        "kind": "choice",
        "id": "hVerified",
        "label": "Problem Verified?"
      },
      {
        "kind": "choice",
        "id": "hRecurring",
        "label": "Recurring Problem?"
      },
      {
        "kind": "choice",
        "id": "hImpact",
        "label": "Business Impact"
      },
      {
        "kind": "choice",
        "id": "hFeas",
        "label": "Technical Feasibility"
      },
      {
        "kind": "choice",
        "id": "hMkt",
        "label": "Market Solutions"
      },
      {
        "kind": "choice",
        "id": "hApproach",
        "label": "Recommended Approach"
      },
      {
        "kind": "choice",
        "id": "hPriority",
        "label": "Priority"
      },
      {
        "kind": "choice",
        "id": "hDecision",
        "label": "Evaluation Decision"
      },
      {
        "kind": "text",
        "id": "inpHComments",
        "label": "Evaluation Comments:",
        "multiline": true
      },
      {
        "kind": "text",
        "id": "inpHNextAction",
        "label": "Recommended Next Action:",
        "multiline": true
      },
      {
        "kind": "text",
        "id": "inpHRevBy",
        "label": "Reviewed By",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpHApproval",
        "label": "Approval / Recommendation",
        "multiline": false
      },
      {
        "kind": "text",
        "id": "inpHDate",
        "label": "Date",
        "multiline": false
      }
    ]
  }
] as const;
