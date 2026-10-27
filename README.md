# Spacewise

> A modern, safety-hardened disk usage analyzer and selective cleanup desktop application for Linux.

Spacewise helps Linux users visualize disk capacity, scan directory trees for space-consuming files, explore directories interactively, and selectively reclaim disk space through verified Trash moves or cautious permanent deletion.

---

## Project Status

**Version 0.1.0 (Initial Public Pre-Release)**

Spacewise is currently in its initial public release (`v0.1.0`). Core storage analysis, recursive directory scanning, file explorer navigation, and safety-hardened cleanup discovery and execution are fully implemented and verified with automated test suites.

<!--
SCREENSHOT PLACEHOLDER:
Genuine application screenshots will be added here prior to the packaged distribution.
Recommended captures:
1. Overview Dashboard (Real mount storage breakdown & largest files)
2. File Explorer (Navigation, sorting, and inspector modal)
3. Selective Cleanup View (Candidate discovery, risk levels, and confirmation dialog)
-->

---

## Features

### Real Storage & Filesystem Capacity
- Reads `/proc/mounts` and calls POSIX `statvfs` directly to display accurate total, used, and available capacity for mounted Linux filesystems.
- Distinguishes physical and user storage from Linux virtual filesystems (`/proc`, `/sys`, `/dev`, `cgroup`, etc.).
- Categorizes storage usage across Developer & Builds, Media & Videos, Documents & Archives, Apps & Flatpaks, System & Core, and Unsorted files.
- Surfaces the largest individual files discovered during analysis.

### Recursive Directory Scanner
- Fast recursive directory traversal implemented in native Rust.
- **Symlink Protection:** Directory scans never follow symbolic links, preventing cyclic loops and unintended out-of-boundary scans.
- **Live Progress:** Streams real-time file counters, scanned byte totals, and current path progress to the UI via Tauri event channels.
- **Cancellation:** Safely interrupt any active scan instantly via atomic cancellation flags.
- **Bounded Error Handling:** Automatically handles and counts permission-denied directories with bounded memory limits (path list capped at 500 entries; full error count accurately reported).

### File Explorer (Analyze Tab)
- Interactive filesystem navigation with back, forward, parent directory, and root jumps.
- Breadcrumb navigation path bar and directory reload.
- Detailed file listings showing name, size, type, category, and last-modified date.
- Column sorting by name, size, type, and modified time (ascending and descending).
- Real-time in-directory search and filtering.
- Toggle visibility for hidden dotfiles (`.`).
- Multi-item selection with bulk actions.
- Inspection sidebar panel with path copying and desktop integration ("Reveal in File Manager").
- Targeted scanning: scan any selected directory or file directly from the explorer.

### Selective Cleanup & Discovery
- **FreeDesktop Trash Integration:** Discovers discarded items in `~/.local/share/Trash` compliant with FreeDesktop.org Trash specifications.
- **Approved Cache Discovery:** Safely identifies known, regenerable application caches under `~/.cache`:
  - Browser caches: Google Chrome, Chromium, Mozilla Firefox.
  - Developer caches: Cargo crate and Git registry, Go compiler build cache (`go-build`), Python Pip wheel cache, Yarn package cache.
  - System & Desktop caches: Thumbnail previews, Fontconfig font caches, Mesa GPU shader caches, Fastfetch, Lutris artwork.
- **Build Artifact Discovery:** Identifies project build folders (such as Rust `target/` directories containing `CACHEDIR.TAG`).
- **Explanatory Package Cache Guidance:** Identifies system package caches (such as `/var/cache/pacman/pkg`), but strictly prohibits direct deletion through the UI. Instead, displays the safe package manager command (`sudo pacman -Sc`) for manual execution.
- **Risk Indicators:** Every item displays an explicit risk level (`safe`, `caution`, `manual_review`), item count, reclaimable size, and explanation.

### Safety Safeguards & Protections
- **No Root Execution:** Spacewise immediately rejects execution under root (`UID 0` or `sudo`) to safeguard system files.
- **Strict Action Validation:** Fails closed if any unrecognized cleanup action is supplied; only `"trash"` and `"permanent_delete"` are accepted.
- **Path Boundary Checks:** All cleanup targets must be within verified user boundaries (`$HOME` or user-owned `/tmp`). System directories (`/etc`, `/usr`, `/var`, `/boot`, `/root`, etc.) and sensitive user directories (`~/.ssh`, `~/.gnupg`, `~/.config`, etc.) are strictly protected.
- **Symlink Rejection:** Symlinks cannot be the direct target of cleanup or deletion operations.
- **Transactional Cross-Filesystem Trash:**
  1. Copies data to an isolated staging directory (`.staging/`) on the Trash filesystem without touching source data.
  2. Performs byte-for-byte content and size verification against the source.
  3. Writes FreeDesktop `.trashinfo` metadata with URL-encoded paths.
  4. Finalizes the item into `Trash/files/` via an intra-filesystem atomic rename.
  5. Removes source files **only** after verification and finalization succeed.
  6. On any failure prior to finalization, staging data is wiped and source files remain 100% untouched.
  7. If source removal fails after finalization, the verified Trash copy is preserved and an honest partial-failure error is reported.
- **Hardened Permanent Deletion:** Filenames in Trash are validated to ensure single-component paths with no traversal (`..`), path separators (`/`, `\`), or null bytes (`\0`).
- **Concurrent Cleanup Lock:** Mutual exclusion prevents overlapping cleanup tasks via an atomic RAII guard.
- **Explicit Confirmation:** Permanent deletion requires checking an explicit acknowledgement checkbox before the action button can be triggered.
- **Content Security Policy (CSP):** Strict desktop CSP disables remote script execution and object embedding.

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Desktop Runtime** | [Tauri 2](https://tauri.app/) (`@tauri-apps/api` v2, `@tauri-apps/plugin-opener` v2) |
| **Backend Core** | [Rust](https://www.rust-lang.org/) (2024 Edition, `libc`, `serde`, `serde_json`) |
| **Frontend Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **Build Tooling** | [Vite 8](https://vitejs.dev/) |
| **Icons & UI** | [Lucide React](https://lucide.dev/), Custom Charcoal & Electric-Lime CSS |

---

## Prerequisites & Requirements

To build and run Spacewise from source, ensure your Linux system has:

1. **Linux OS:** Linux kernel 5.x or newer (x86_64, aarch64).
2. **Node.js & npm:** Node.js v18 or newer (v20+ recommended) with `npm`.
3. **Rust Toolchain:** Stable Rust 1.85+ (or compatible 2024 edition support) with `cargo`.
4. **Tauri System Dependencies:** Standard Linux development headers required by Tauri 2:
   - On Debian/Ubuntu-based systems:
     ```bash
     sudo apt update
     sudo apt install -y build-essential curl wget file libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
     ```
   - On Arch Linux / CachyOS / Manjaro:
     ```bash
     sudo pacman -S --needed base-devel curl wget openssl webkit2gtk-4.1 gtk3
     ```
   - On Fedora / RHEL-based systems:
     ```bash
     sudo dnf install -y gcc gcc-c++ make openssl-devel webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel
     ```

---

## Installation & Running from Source

Clone the repository and install frontend dependencies:

```bash
# Clone the repository
git clone https://github.com/krishnakumar5757/spaceware.git
cd spaceware

# Install Node.js dependencies
npm install
```

### Launch in Development Mode
To run the desktop application with live reloading:

```bash
npm run tauri dev
```

### Build for Production
To compile the production desktop binary and frontend bundle:

```bash
npm run tauri build
```
The compiled Linux desktop executable will be generated under `src-tauri/target/release/spacewise`.

*(Note: Release assets will be available on the [GitHub Releases](https://github.com/krishnakumar5757/spaceware/releases) page when version tags are published.)*

---

## Installation & Downloads

Pre-built Linux binaries and packages are provided on the [GitHub Releases](https://github.com/krishnakumar5757/spaceware/releases) page for each release tag.

### 1. Standalone AppImage (Universal Linux)
The AppImage runs portably on most modern x86_64 Linux distributions without requiring system-wide installation:
1. Download `spacewise_<version>_amd64.AppImage` from the release assets.
2. Mark it as executable:
   ```bash
   chmod +x spacewise_*_amd64.AppImage
   ```
3. Run directly:
   ```bash
   ./spacewise_*_amd64.AppImage
   ```

### 2. Arch Linux & CachyOS Native Package (`.pkg.tar.zst`)
Users on Arch Linux, CachyOS, and EndeavourOS can install the native Pacman package:
1. Download `spacewise-<version>-1-x86_64.pkg.tar.zst` from the release assets.
2. Install with Pacman:
   ```bash
   sudo pacman -U spacewise-*-x86_64.pkg.tar.zst
   ```
3. Launch via your desktop application menu or by running `spacewise` in terminal.

You can also build and install the package locally from source:
```bash
cd packaging/arch
makepkg -si
```

### 3. Verifying Cryptographic Checksums
Each release provides a `SHA256SUMS.txt` manifest containing SHA-256 hashes for all downloadable assets. To verify file integrity:
```bash
sha256sum -c SHA256SUMS.txt
```

### 4. Platform Limitations & Support
- **Architecture:** Linux x86_64 (64-bit). ARM64/aarch64 and macOS/Windows platforms are not currently supported.
- **Display Protocol:** Wayland and X11 are supported through GTK3 / WebKitGTK.
- **Dependencies:** Built against WebKitGTK 4.1 (`webkit2gtk-4.1`). Ensure graphics drivers and WebKitGTK dependencies are installed.

---

## Usage Guide

### 1. Storage Overview
- Upon launch, Spacewise automatically inspects your mounted filesystem and shows real total, used, and free disk space in the sidebar and dashboard.
- Click **Start Directory Scan** (or use Analyze) to perform an in-depth recursive scan of your home folder or selected directories.
- The dashboard visualizer displays category breakdowns and lists the largest files taking up space.

### 2. Exploring & Analyzing Files
- Open the **Analyze** tab from the sidebar to browse your files.
- Use the breadcrumbs or navigation buttons to traverse folders.
- Search for specific filenames using the search bar or sort columns by clicking column headers.
- Select one or more files/folders using checkboxes.
- Use **Inspect** to see detailed metadata and permissions, or **Reveal in File Manager** to locate the file in your default desktop file browser.
- Click **Scan Selected** to compute size aggregations for chosen folders.

### 3. Reviewing & Executing Cleanup
- Open the **Cleanup** tab to review automatically discovered cleanup candidates.
- Review each item's category, description, and risk level.
- **Select Safe Only:** Conveniently checks only items flagged as `safe` (e.g. regenerable browser and thumbnail caches).
- Choose your cleanup action:
  - **Move to Trash (Recommended):** Moves files to the FreeDesktop Trash so they can be restored if needed.
  - **Permanent Deletion:** Completely removes files from disk. Requires checking the confirmation checkbox acknowledging that the deletion cannot be undone.
- Click **Clean Selected Items** to execute the verified cleanup operation. A detailed results summary will display the exact bytes freed and items removed.

---

## Safety Guidelines & Limitations

While Spacewise includes extensive safety mechanisms, filesystems have inherent real-world complexities. Please note the following:

- **Always Review Candidates:** Never delete files without inspecting the paths and understanding what application owns them.
- **Permanent Deletion is Irreversible:** Files deleted permanently bypass the Trash bin and cannot be recovered through standard tools.
- **Non-Root Execution:** Spacewise must never be run with `sudo` or as `root`. The application explicitly checks for and prevents execution under UID 0.
- **Cross-Filesystem Moves:** Moving files to Trash across separate physical partitions (e.g., from a secondary drive or separate `/tmp` partition to `~/.local/share/Trash`) requires cross-device copy-verify-unlink operations. If destination space is exhausted, Spacewise aborts and preserves source files intact.
- **Permissions:** Spacewise runs with standard user privileges. Files or folders requiring higher permissions will be skipped, with an accurate count of permission-denied paths recorded in scan results.
- **Concurrent Filesystem Changes (TOCTOU):** Files changed or removed by external programs between discovery and cleanup will be re-checked prior to deletion. However, on standard POSIX filesystems without descriptor-relative unlinking, external processes running as the same user can theoretically modify directory entries concurrently.

---

## Development & Verification

### Common Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the Vite frontend dev server on `http://localhost:1420` |
| `npm run build` | Typechecks (`tsc`) and compiles the frontend into `dist/` |
| `npm run tauri dev` | Starts the full desktop application in development mode |
| `npm run tauri build` | Compiles release desktop binaries and application bundles |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Checks Rust code for compilation errors |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Runs all 41 backend Rust unit, integration, and fault-injection tests |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Validates Rust code formatting according to standard style |

### Backend Test Coverage
The Rust test suite comprises 41 automated tests verifying:
- Strict path validation and rejection of root, system paths, path traversal (`..`), and symlinks.
- FreeDesktop Trash creation, URL encoding, `.trashinfo` metadata generation, and naming collision handling.
- Hardened permanent deletion boundary checks and character validation.
- Fault-injection testing covering copy failures, content verification mismatches, metadata errors, and partial source removal failures.
- Mutex lock mutual exclusion and RAII guard release on completion.
- Bounded memory limits on scanner error reporting.

---

## Troubleshooting

- **Error: `Spacewise must not be executed with root/sudo privileges`**
  *Remedy:* Launch Spacewise as your regular desktop user. Root execution is prohibited to protect core system files.
- **Error: `A cleanup operation is already in progress`**
  *Remedy:* Wait for the active cleanup operation to finish before triggering another request.
- **App fails to compile due to missing WebKitGTK / GTK packages:**
  *Remedy:* Ensure you have installed `webkit2gtk-4.1` and `gtk3` development libraries as detailed in the Prerequisites section.
- **Permission Denied warnings in scan results:**
  *Remedy:* This is expected behavior when scanning directories containing files owned by other users or restricted system daemons. Spacewise safely skips unreadable entries.

---

## Contributing

Contributions, feedback, and bug reports are welcome!

- **Bug Reports:** If you encounter unexpected behavior or safety concerns, please open an issue describing your Linux distribution, desktop environment, and the steps to reproduce.
- **Pull Requests:** Before opening a PR, ensure that:
  1. `cargo check --manifest-path src-tauri/Cargo.toml` passes with zero warnings.
  2. `cargo test --manifest-path src-tauri/Cargo.toml` passes all 41 tests.
  3. `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passes cleanly.
  4. `npm run build` succeeds without TypeScript or Vite errors.

---

## License

Spacewise is open-source software licensed under the [MIT License](LICENSE). See the [LICENSE](LICENSE) file for the full license text.

---

## Acknowledgements

- Built with [Tauri](https://tauri.app/), [React](https://react.dev/), and [Vite](https://vitejs.dev/).
- Trash specifications based on the [FreeDesktop.org Trash Specification](https://specifications.freedesktop.org/trash-spec/trashspec-latest.html).
- Icons provided by [Lucide](https://lucide.dev/).
