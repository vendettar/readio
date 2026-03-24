# `@readio/cloud`

This directory is the current Go backend scaffold for Cloud.

Current role:

- hosts the scaffold-phase backend
- serves the staged Cloud UI artifact from the active release
- owns the current `/api/proxy`, same-origin backend networking, and SQLite bootstrap behavior

Rules for the next implementation steps:

- do not add new React/Vite frontend code to this directory
- do not treat this directory as the final Cloud topology
- keep backend work here focused on the current Go scaffold and backend-owned contracts
