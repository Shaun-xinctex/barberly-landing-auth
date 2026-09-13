# Barberly — M0 handoff（交接給 M1.1）

狀態：**M0 驗收全綠，READY for M1.1**（2026-09-13）

---

## 新視窗開始工作前的三件事

1. **連接本機資料夾** —— 資料夾授權是「每個 session 各自獨立」的，新視窗不會沿用。
   在輸入框左下角 `+` 右邊那個「資料夾帶加號」圖示，選 `C:\Users\skywa\barber-booking-platform`。
   連上之後 repo 裡 `.claude/skills/` 的課程技能才會出現在可用技能清單。

2. **確認連接器都在** —— AWS API MCP / Vercel Connect / Supabase Connector。這些是帳號層級的，正常會沿用。

3. **M1.1 的技能還沒裝** —— 目前 repo 裡只有 M0 的五個技能。M1.1 的技能在課程 repo 的另一個分支：

   ```
   https://github.com/uopsdod/claude-2-barber-booking-platform
   分支：m1.1-seller-setup
   ```

   其他分支：`m1.2-buyer-setup`、`m2.1-buyer-to-admin-payments`、`m2.2-admin-to-seller-payments`、`m3-domain`。
   照課程 Step 10 的做法，用 git clone 工具讀該分支的 `.claude/skills/`，再裝進專案。

---

## 資源座標

| 項目 | 值 |
|---|---|
| GitHub repo | `Shaun-xinctex/barberly-landing-auth`（public，預設分支 main） |
| 本機 clone | `C:\Users\skywa\barber-booking-platform` |
| Vercel 專案 | `barberly-landing-auth`（`prj_MNnvibqpU3NnrthrFbmfvoTcJ3ih`，team XINCTEX，Hobby） |
| 線上網址 | https://barberly-landing-auth-ten.vercel.app |
| Supabase 專案 | `barber-booking-platform-001`，ref `kzzyiybvhtmcqigzrojy`，ap-southeast-2 |
| AWS 帳號 | 680160265479 |
| GitHub PAT | AWS Secrets Manager，us-east-1，secret 名稱 **`github/pat/xinctex`**，JSON key `GITHUB_PAT` |

> ⚠️ PAT 的 secret 名稱跟課程慣例（`barber-project/github`）不同。`aws-secrets-best-practice` 有交代「先 list 再 grep `github`」，所以不會壞，但要對齊可以複製一份。

---

## 技術現況

**前端**：純 Vite 7 + React 19 SPA，React Router，靜態部署到 `dist/`。**沒有 SSR、沒有 Cloudflare/wrangler、沒有任何 Lovable 殘留**（`grep -ri lovable` 整個 repo 零結果）。

原本 Lovable 產出的是 TanStack Start SSR，會踩課程說的「build 成功但每條路由 404」陷阱，已經轉掉。

**路由**（照課程規範，`vercel.json` 的 catch-all rewrite 提供 SPA fallback）：

| 路徑 | 頁面 |
|---|---|
| `/` | landing page |
| `/login` | 登入 / 註冊合併頁（含 Customer / Barber 角色分頁） |
| `/sign-in`、`/sign-up` | 同一頁，預選對應模式 |
| `/barbers` | 登入後 shell（未登入導向 `/login`） |
| `/app` | 舊別名，轉址到 `/barbers` |
| 其他 | 404 |

**環境變數**（build time 讀取，Vercel 和本機 `.env` 都要有）：

```
VITE_SUPABASE_URL              https://kzzyiybvhtmcqigzrojy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
VITE_SUPABASE_PROJECT_ID       kzzyiybvhtmcqigzrojy
```

> `.env` 有被 commit 進 repo（只含 publishable key，瀏覽器本來就看得到，可接受）。Vercel 那邊也已手動設定。

---

## 資料庫現況

**只有 `profiles` 一張表**（M0 Step 9），沒有其他自訂表。

```
profiles(
  id uuid PK -> auth.users(id) on delete cascade,
  email text,
  display_name text,                      -- 店家用這欄放店名（M1.1 要求必填）
  role text not null default 'customer'
    check (role in ('customer','shop','admin')),
  bank_account_name text,                 -- 店家層級 payout 目標，M1.1 填
  bank_account_number text,
  created_at timestamptz not null default now()
)
```

- RLS 已啟用，policy：`profiles_select_own`、`profiles_update_own`
- trigger `on_auth_user_created` → `handle_new_user()`，註冊時從 `raw_user_meta_data->>'role'` 複製角色
- 已執行的 migrations：`create_profiles_role_stub`、`revoke_public_execute_on_handle_new_user`、`grant_handle_new_user_to_auth_admin`

**安全性修正**：`get_advisors` 抓到 `handle_new_user()` 是 `SECURITY DEFINER` 且對 `anon` / `authenticated` 開放 `/rest/v1/rpc` —— 未登入者可直接呼叫造出 profile row。已撤銷 `public` / `anon` / `authenticated` 的 EXECUTE，只留 `supabase_auth_admin`。**之後新增 SECURITY DEFINER 函式要記得做同樣處理。**

**現有資料**：`auth.users` 與 `profiles` 各 3 筆，無孤兒，角色值全部合法。

| Email | role |
|---|---|
| `skywalf128@gmail.com` | shop |
| `xincheng.manager@gmail.com` | customer |
| `xincheng.manager@xinctex.com` | shop（backfill 補的） |

**Supabase Auth 設定**：Confirm email 已關閉（`mailer_autoconfirm: true`），Email provider 啟用。
未開：leaked password protection（`get_advisors` 提醒，非必要）。

---

## 工作方式（重要，會影響效率）

**push 推不了。** 這個 session 的 git proxy 不允許對這個 repo 寫入：

```
access denied by the git proxy: Shaun-xinctex/barberly-landing-auth
is not in this session's authorized repository set
```

不要反覆重試，那是政策拒絕。目前的做法是：Claude 直接把檔案寫進連接的資料夾，使用者自己跑

```powershell
cd "C:\Users\skywa\barber-booking-platform"
git add -A
git commit -m "..."
git push origin main
```

**不要 force push / 改寫已發布歷史。**

**雲端沙箱的網路受限** —— `supabase.co`、`fonts.googleapis.com` 被 egress policy 擋住（403）。要打線上服務用內建瀏覽器（跑在使用者電腦上，走他的網路），不要用沙箱的 `curl` 然後誤判成服務掛掉。

---

## M1.1 的地基已經備好

`profiles.role` 是 M1.1 gate 店家頁面的依據，`display_name` 和 `bank_account_*` 兩組欄位也已經預留好（課程規定銀行資訊是**店家層級**、放在 `profiles`，不可放 `barbers`、不可進公開列表）。

課程規定的 M1.1 表：`barbers`（`shop_id` → `profiles.id`，**不可 unique**，要加 index）、`services`、`bookable_slots`。

每次 migration 的標準順序：**`apply_migration` → `get_advisors` → `generate_typescript_types` → 才寫 UI**。
