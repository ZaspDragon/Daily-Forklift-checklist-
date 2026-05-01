# Daily Forklift Pre-use Inspection Checklist

**Chadwell Supply** — Role-based forklift inspection system with employee and management views.

## 🔗 Live App

👉 [https://zaspdragon.github.io/Daily-Forklift-checklist-/](https://zaspdragon.github.io/Daily-Forklift-checklist-/)

## Demo Credentials

| Role | Username | PIN |
|------|----------|-----|
| Employee | `employee` | `1234` |
| Manager | `manager` | `2468` |
| Admin | `admin` | `9999` |

## Features

### Employee View
- PIN-based sign-in
- Start daily forklift inspection
- Enter: Branch, Truck #, Serial #, Date, Shift, Operator Name
- 15-item checklist with **Pass / Fail / N/A** buttons
- Inline failure notes required when Fail is selected
- Submit inspection with confirmation
- View your own recent inspection history

### Management View
- View all submitted inspections across all drivers
- Inspection cards showing: Date, Branch, Truck #, Serial #, Shift, Operator, Pass/Fail counts, Status badge, Failure notes
- Filter by: Date, Truck #, Operator, Status
- Export all data as CSV
- Dashboard stats: total inspections, operators, passed, failed

### Admin View
- Everything in Management view, plus:
- **Clear All History** button (admin-only)

### Checklist Items
1. Forks
2. Tires
3. Horn
4. Lights
5. Backup alarm
6. Seatbelt
7. Brakes
8. Steering
9. Hydraulic leaks
10. Battery / propane
11. Mast / chains
12. Data plate
13. Safety decals
14. General damage
15. Floor area clear

## Design
- Mobile-first, large touch-friendly buttons
- Professional warehouse safety look
- Chadwell-style blue/white/gray palette
- Green = Pass, Red = Fail, Gray = N/A
- Clean, card-based management dashboard

## Tech Stack
- Vanilla HTML, CSS, JavaScript
- No dependencies or build tools
- `localStorage` for data persistence
- `sessionStorage` for login session
- GitHub Pages for hosting

## Firebase Upgrade Path
The code is organized with clear separation between auth, data, and UI:
- **Auth section** (`USERS` array, `doLogin`, `doLogout`) → replace with Firebase Auth
- **Data section** (`getAllInspections`, `saveInspection`) → replace with Firestore reads/writes
- **UI** stays the same
