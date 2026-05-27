# BitByBit 🧩

Competitive coding platform for teams. Built with Next.js + Supabase.

---

## Stack

- **Frontend** — Next.js 14, TypeScript, Tailwind CSS, Monaco Editor
- **Backend** — Supabase (Postgres + Auth + Realtime)
- **Code Execution** — [Glot.io](https://glot.io) (free, open-source)
- **Payments** — Manual UPI flow (no third-party gateway)

---

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in your Supabase and Glot credentials
npm run dev
```

---

## Payments — UPI Flow

No Razorpay or payment gateway needed. The flow is entirely manual:

1. **Admin** creates a contest and sets a UPI ID (e.g. `yourname@upi`) in the Contests tab of the Admin Panel.
2. **User** clicks "Register" on the contest card — they see a **QR code** generated from the UPI ID.
3. User scans the QR with any UPI app (PhonePe, GPay, Paytm, etc.) and pays.
4. User enters their **transaction ID** (from payment history in their UPI app) and clicks Submit.
5. The registration is saved as **pending** in the database.
6. **Admin** sees the pending registration in Admin → Contests with the transaction ID displayed, and clicks **Confirm** or **Reject** after verifying in their bank/UPI app.

### Supabase table

The `contest_registrations` table already has a `upi_id` column and `status` (`pending` / `confirmed` / `rejected`). No migration needed if you used the original schema.

---

## Code Execution — Glot.io

Piston (`emkc.org/api/v2/piston`) is no longer active. The platform now uses **Glot.io**.

### Setup

1. Sign up at https://glot.io and get a free API token from https://glot.io/account/token
2. Add to `.env.local`:
   ```
   GLOT_API_TOKEN=your-token-here
   ```

### Self-hosting (optional)

Run the open-source glot-run executor locally for zero rate-limits:

```bash
docker run -d -p 8088:8088 glot/glot-run
```

Then set in `.env.local`:
```
GLOT_API_URL=http://localhost:8088/api/run
```

### Supported Languages

| Language   | Runtime |
|------------|---------|
| Python     | 3.x     |
| JavaScript | Node.js |
| C++        | GCC     |
| Java       | OpenJDK |
| Rust       | Stable  |
| Go         | Latest  |

---

## Environment Variables

| Variable               | Required | Description                              |
|------------------------|----------|------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`    | ✅ | Your Supabase project URL           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key                 |
| `SUPABASE_SERVICE_ROLE_KEY`   | ✅ | Supabase service role key           |
| `GLOT_API_TOKEN`              | ⚠️ | Glot.io token (free tier works without but is rate-limited) |
| `GLOT_API_URL`                | ❌ | Override for self-hosted Glot runner |

No Razorpay keys needed. UPI IDs are managed per-contest in the Admin Panel.

---

## Admin Panel

- **Overview** — Member stats, submission counts
- **Submissions** — Review & approve/reject code submissions
- **Problems** — Create/edit problems with test cases
- **Members** — View all registered members
- **Contests** — Create contests, set UPI ID, manage status, verify registrations

