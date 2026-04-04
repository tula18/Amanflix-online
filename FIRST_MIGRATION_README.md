# Amanflix — First Migration Guide

Step-by-step instructions for migrating from the old layout (everything inside one folder) to the new separated layout (code and data in different folders).

**Do this ONCE. After this, all future updates use `update_helper.py update`.**

> **Data safety:** This guide uses **copy**, not move. Your original files stay in place until you've verified everything works. Only delete the originals after confirming the app runs correctly.

---

## Before You Start

**What you need:**
- The production server with the current Amanflix running
- The updated codebase (with `paths.py`, `data_config.json`, and `update_helper.py`)
- ~10–20 minutes of downtime (copy is slower than move, but safer)

**What will happen:**
- A new `Data/` folder will hold all permanent files (videos, posters, database, etc.)
- The production code folder will only contain code + venv (small, fast to swap)
- The `update_helper.py` script will be placed one level above the production folder

---

## Step 1 — Stop the Running App

**Windows:**
```batch
taskkill /F /IM python.exe
```

Verify stopped:
```batch
wmic process where "commandline like '%%app.py%%' and name like '%%python%%'" get processid
```

**macOS / Linux:**
```bash
pkill -f app.py
```

Verify stopped:
```bash
pgrep -f app.py
```

Should return nothing.

---

## Step 2 — Create the Folder Structure

**Windows** (from `Z:\Amanflix\`):
```batch
cd Z:\Amanflix
mkdir Data
mkdir Data\uploads
mkdir Data\files
mkdir Data\posters_combined
mkdir Data\instance
mkdir Data\backups
mkdir Data\logs
mkdir Amanflix_backups
mkdir Amanflix_new_version
```

**macOS / Linux** (adjust root path as needed):
```bash
cd /path/to/Amanflix
mkdir -p Data/uploads Data/files Data/posters_combined Data/instance Data/backups Data/logs
mkdir -p Amanflix_backups Amanflix_new_version
```

After this step your structure should look like:

```
Amanflix/
├── Amanflix_prod/          ← current production (already exists)
├── Data/
│   ├── uploads/
│   ├── files/
│   ├── posters_combined/
│   ├── instance/
│   ├── backups/
│   └── logs/
├── Amanflix_backups/
└── Amanflix_new_version/
```

---

## Step 3 — Copy Data Into the New Data Folder

Copy all data from the current production folder into `Data/`. The originals stay in place as a safety net.

**Windows** — use `robocopy` (handles large folders reliably):
```batch
:: Video uploads (~1.5TB) — this will take a while
robocopy Z:\Amanflix\Amanflix_prod\api\uploads              Z:\Amanflix\Data\uploads          /E /COPYALL

:: JSON metadata files
robocopy Z:\Amanflix\Amanflix_prod\api\cdn\files            Z:\Amanflix\Data\files            /E /COPYALL

:: Poster images (~68K files)
robocopy Z:\Amanflix\Amanflix_prod\api\cdn\posters_combined Z:\Amanflix\Data\posters_combined /E /COPYALL

:: SQLite database
robocopy Z:\Amanflix\Amanflix_prod\api\instance             Z:\Amanflix\Data\instance         /E /COPYALL

:: Backups (if any)
robocopy Z:\Amanflix\Amanflix_prod\api\backups              Z:\Amanflix\Data\backups          /E /COPYALL

:: Logs (if any)
robocopy Z:\Amanflix\Amanflix_prod\api\logs                 Z:\Amanflix\Data\logs             /E /COPYALL
```

**macOS / Linux:**
```bash
cp -r Amanflix_prod/api/uploads/*                Data/uploads/
cp -r Amanflix_prod/api/cdn/files/*              Data/files/
cp -r Amanflix_prod/api/cdn/posters_combined/*   Data/posters_combined/
cp -r Amanflix_prod/api/instance/*               Data/instance/
cp -r Amanflix_prod/api/backups/*                Data/backups/   2>/dev/null || true
cp -r Amanflix_prod/api/logs/*                   Data/logs/      2>/dev/null || true
```

### Verify the copy worked

**Windows:**
```batch
:: Database should be here
dir Z:\Amanflix\Data\instance\amanflix_db.db

:: JSON files should be here
dir Z:\Amanflix\Data\files\*.json

:: Count posters — both numbers should match
dir Z:\Amanflix\Data\posters_combined\ /B | find /C /V ""
dir Z:\Amanflix\Amanflix_prod\api\cdn\posters_combined\ /B | find /C /V ""
```

**macOS / Linux:**
```bash
ls Data/instance/amanflix_db.db
ls Data/files/*.json

# Both counts should match
find Data/posters_combined -type f | wc -l
find Amanflix_prod/api/cdn/posters_combined -type f | wc -l
```

---

## Step 4 — Place the Updated Code

Copy the updated codebase (the version with `paths.py` and `data_config.json`) into the production folder.

**Option A — Replace the production code in place:**

The key new/modified files are:

```
api/paths.py                      ← NEW: central path module
api/config/data_config.json       ← NEW: data root config (inside config/)
api/app.py                        ← MODIFIED
api/api/routes/admin.py           ← MODIFIED
api/api/routes/upload.py          ← MODIFIED
api/api/routes/stream.py          ← MODIFIED
api/api/routes/movies.py          ← MODIFIED
api/api/routes/shows.py           ← MODIFIED
api/api/utils.py                  ← MODIFIED
api/cdn/cdn.py                    ← MODIFIED
api/cdn/cdn_admin.py              ← MODIFIED
api/cdn/utils.py                  ← MODIFIED
api/utils/data_helpers.py         ← MODIFIED
api/utils/logger.py               ← MODIFIED
api/create_superadmin.py          ← MODIFIED
api/make_images_db.py             ← MODIFIED
```

**Option B — Use the update helper for the first time:**

1. Place the full updated codebase in `Amanflix_new_version/`
2. Continue to Step 5 to configure the helper
3. Run `python update_helper.py update` — it will swap the folders for you

---

## Step 5 — Place and Configure the Update Helper

Copy `update_helper.py` to the Amanflix root (one level above `Amanflix_prod/`):

**Windows:**
```batch
copy Z:\Amanflix\Amanflix_prod\update_helper.py Z:\Amanflix\update_helper.py
cd Z:\Amanflix
```

**macOS / Linux:**
```bash
cp Amanflix_prod/update_helper.py .
cd /path/to/Amanflix
```

Run the configuration wizard:
```
python update_helper.py configure
```

When prompted, enter:

| Prompt | Value |
|--------|-------|
| Data folder path | `Data` |
| Production folder | `Amanflix_prod` |
| New version folder | `Amanflix_new_version` |
| Backup folder | `Amanflix_backups` |
| Venv path | `api/venv` (press Enter for default) |

Review the summary and confirm with `Y`.

This creates:
- `update_config.json` — helper configuration
- `Amanflix_prod/api/config/data_config.json` — app path configuration

---

## Step 6 — Verify the Configuration

```
python update_helper.py status
```

Expected output:

```
Path Validation:
  [OK]     Data folder
  [OK]     Production folder
  [OK]     Backup folder
  [OK]     Data/uploads
  [OK]     Data/posters_combined
  [OK]     Data/files
  [OK]     Data/instance
  [OK]     Data/backups
  [OK]     Data/logs
  [OK]     Venv
  [OK]     app.py
  [OK]     data_config.json
  [----]   New version folder  (normal — no update pending)
```

---

## Step 7 — Start the App and Verify

**Windows:**
```batch
cd Z:\Amanflix\Amanflix_prod\api
venv\Scripts\python.exe app.py
```

**macOS / Linux:**
```bash
cd Amanflix_prod/api
venv/bin/python app.py
```

### Check that it works

1. Open the Amanflix website from another device on the network
2. Verify movies/shows load (confirms JSON metadata paths work)
3. Verify poster images display (confirms posters path works)
4. Try playing a video (confirms uploads path works)
5. Try logging in (confirms database path works)

Quick sanity check via Python:

**Windows:**
```batch
venv\Scripts\python.exe -c "from paths import *; print(UPLOADS_DIR); print(CDN_FILES_DIR); print(DB_URI)"
```

**macOS / Linux:**
```bash
venv/bin/python -c "from paths import *; print(UPLOADS_DIR); print(CDN_FILES_DIR); print(DB_URI)"
```

All three should point inside `Data/`.

---

## Step 8 — Clean Up Originals (Only After Confirming It Works)

Once you've verified the app is running correctly with data from the new `Data/` folder, delete the original copies to free up space.

**Windows:**
```batch
rmdir /S /Q Z:\Amanflix\Amanflix_prod\api\uploads
rmdir /S /Q Z:\Amanflix\Amanflix_prod\api\cdn\files
rmdir /S /Q Z:\Amanflix\Amanflix_prod\api\cdn\posters_combined
rmdir /S /Q Z:\Amanflix\Amanflix_prod\api\instance
```

**macOS / Linux:**
```bash
rm -rf Amanflix_prod/api/uploads
rm -rf Amanflix_prod/api/cdn/files
rm -rf Amanflix_prod/api/cdn/posters_combined
rm -rf Amanflix_prod/api/instance
```

---

## Done!

The migration is complete. From now on, to update the production server:

1. Place new code in `Amanflix_new_version/`
2. Run `python update_helper.py update`
3. Done — no more 15-hour waits

See `UPDATE_HELPER_README.md` for full documentation on all commands.

---

## Rollback (If Something Went Wrong)

Since you used copy, the original data is still inside `Amanflix_prod/`. Just delete `data_config.json` to make the app fall back to the original relative paths, then restart:

**Windows:**
```batch
taskkill /F /IM python.exe
del Z:\Amanflix\Amanflix_prod\api\config\data_config.json
cd Z:\Amanflix\Amanflix_prod\api
venv\Scripts\python.exe app.py
```

**macOS / Linux:**
```bash
pkill -f app.py
rm Amanflix_prod/api/config/data_config.json
cd Amanflix_prod/api
venv/bin/python app.py
```

The app will automatically fall back to the original relative paths (`cdn/files`, `uploads`, etc.) when `data_config.json` is missing.
