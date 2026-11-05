export const CASE_FIELDS = [
  {
    "id": "name",
    "label": "Case label"
  },
  {
    "id": "summary",
    "label": "Source summary"
  },
  {
    "id": "activity",
    "label": "Documented activity"
  },
  {
    "id": "outcomes",
    "label": "Source-reported outcomes"
  },
  {
    "id": "review",
    "label": "Human review notes"
  }
];
export const templates = [
  {
    "id": "hospital-periodic-v1",
    "name": "Periodic operations report",
    "family": "Operations",
    "sections": [
      {
        "id": "summary",
        "title": "Summary"
      },
      {
        "id": "giving",
        "title": "Income by fund"
      },
      {
        "id": "stories",
        "title": "Program updates"
      },
      {
        "id": "program",
        "title": "Program notes"
      }
    ],
    "source": "Generic example structure created for this independent edition.",
    "requirements": "Use only authorized source evidence. Verify figures, meaning, permissions, and the intended recipient. This is not an official funder form.",
    "formatStatus": "Illustrative structure. Adapt and validate locally before real use.",
    "owner": "Assign locally",
    "cadence": "Set locally"
  },
  {
    "id": "hospital-progress-v1",
    "name": "Program progress report",
    "family": "Operations",
    "sections": [
      {
        "id": "position",
        "title": "Reporting scope"
      },
      {
        "id": "counts",
        "title": "Activity counts"
      },
      {
        "id": "before",
        "title": "Prior period"
      },
      {
        "id": "after",
        "title": "Current period"
      }
    ],
    "source": "Generic example structure created for this independent edition.",
    "requirements": "Use only authorized source evidence. Verify figures, meaning, permissions, and the intended recipient. This is not an official funder form.",
    "formatStatus": "Illustrative structure. Adapt and validate locally before real use.",
    "owner": "Assign locally",
    "cadence": "Set locally"
  },
  {
    "id": "hospital-case-v1",
    "name": "Case evidence summary",
    "family": "Case review",
    "sections": [
      {
        "id": "name",
        "title": "Case label"
      },
      {
        "id": "summary",
        "title": "Source summary"
      },
      {
        "id": "activity",
        "title": "Documented activity"
      },
      {
        "id": "outcomes",
        "title": "Source-reported outcomes"
      },
      {
        "id": "review",
        "title": "Human review notes"
      }
    ],
    "source": "Generic example structure created for this independent edition.",
    "requirements": "Use only authorized source evidence. Verify figures, meaning, permissions, and the intended recipient. This is not an official funder form.",
    "formatStatus": "Illustrative structure. Adapt and validate locally before real use.",
    "owner": "Assign locally",
    "cadence": "Set locally"
  }
];
export function template(id){const t=templates.find(x=>x.id===id);if(!t)throw Object.assign(Error("Choose an available report template"),{status:422});return structuredClone(t);}
