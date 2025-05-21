# Comprehensive Testing Plan for Production Launch

This document outlines the testing tasks required for the Amanflix application (Backend API, CDN, Frontend, and Data Downloader Tool) before going to production.

## I. Backend Testing (API & CDN)

### A. API Core (`api/app.py`, `api/models.py`)

- [ ] **Task:** Verify Flask App Initialization and Configuration.
    - **Description:** Ensure the Flask application starts without errors, CORS is configured correctly, request logging is active, and the database (SQLite) is initialized. Check `app.blueprints` for expected blueprint names and prefixes.
    - **Automation:** Basic startup script, check logs for initialization messages. Unit test to check `app.blueprints`.
- [ ] **Task:** Verify Content Catalog Loading.
    - **Description:** Ensure `movies_little_clean.json`, `tv_little_clean.json`, `movies_with_images.json`, and `tv_with_images.json` are loaded correctly at startup. Check for error handling if files are missing or corrupt.
    - **Automation:** Mock file system, test loading functions with valid and invalid files.
- [ ] **Task:** Verify Error Handlers.
    - **Description:** Test each custom error handler (400, 401, 403, 404, 503) by intentionally triggering these errors and verifying the JSON response format and status code.
    - **Automation:** API integration tests that force these error conditions.
- [ ] **Task:** Verify `/ip` endpoint.
    - **Description:** Check if the `/ip` endpoint returns the client's IP address correctly.
    - **Automation:** API integration test.
- [ ] **Task:** Verify FFMPEG Availability Check.
    - **Description:** Test the `check_ffmpeg_available()` utility and ensure the application logs the correct status and behaves accordingly.
    - **Automation:** Mock `subprocess.run` to simulate FFMPEG presence or absence.
- [ ] **Task:** Verify Database Schema and Relationships (`api/models.py`).
    - **Description:** Ensure all tables (User, Admin, BugReport, BlacklistToken, WatchHistory, MyList, UploadRequest, Movie, TVShow, Season, Episode, Notification, UserSession, UserActivity) are created correctly with defined columns, types, and relationships.
    - **Automation:** Use an ORM tool or script to inspect the live database schema against model definitions.
- [ ] **Task:** Verify Model Serialization (`api/models.py`).
    - **Description:** For each model with a `serialize` method, test that it returns the expected JSON structure.
    - **Automation:** Unit tests for each model's `serialize` method.
- [ ] **Task:** Verify Data Integrity and Constraints (`api/models.py`).
    - **Description:** Test database constraints (unique, nullable, foreign key) for all models.
    - **Automation:** Integration tests attempting to violate constraints.

### B. API Routes (`api/api/routes/`)

**General Task Structure for Endpoints:**
For each endpoint:
- [ ] **Task:** Test [Endpoint Action] (e.g., `Test Admin Creation (/api/admin/create)`).
    - **Description:**
        - Verify successful operation with valid inputs and appropriate authentication/authorization.
        - Test input validation (required fields, data types, formats, boundary conditions).
        - Test authentication and authorization (e.g., correct user role, token validity).
        - Test failure scenarios (invalid input, unauthorized access, resource not found, server errors).
        - Verify correct HTTP status codes and response body structure for success and failure.
        - Verify any side effects (e.g., database changes, file system changes, interactions with other services/modules).
    - **Automation:** API integration tests using a testing framework (e.g., PyTest with `requests` or Flask's test client). Mock dependencies where necessary.

**Key Areas to Cover in API Routes:**

*   **`admin.py` (Admin Management):**
    - [ ] Admin CRUD (Create, Read, Update, Delete) with role hierarchy.
    - [ ] Admin login/logout/token verification.
    - [ ] User management by admin (list, ban/unban, delete, update).
    - [ ] Bug report management (list, delete, resolve/reopen, counts).
    - [ ] Upload request management (list, delete, counts).
    - [ ] **Critical:** CDN Data Import (`/api/admin/import/cdn_data`): Test thoroughly with JSON/CSV, images, merge options, error handling, and in-memory data updates.
*   **`analytics.py` (Analytics and Session Management):**
    - [ ] Session creation, heartbeat, end-session.
    - [ ] Dashboard data retrieval (test all metrics, `days` parameter).
    - [ ] Active sessions listing.
    - [ ] Content metrics retrieval (test all metrics, `days` parameter).
*   **`auth.py` (User Authentication):**
    - [ ] User registration, login, logout, token verification.
    - [ ] User profile retrieval, update, account deletion.
*   **`bug_report.py` (Bug Reporting):**
    - [ ] Bug report submission by authenticated users.
*   **`movies.py` (Movie Data - DB based):**
    - [ ] CRUD for movies (if applicable, mostly GET).
    - [ ] Listing, random, search, single movie retrieval.
    - [ ] Movie existence check (DB and video file).
*   **`mylist.py` (User's Watchlist):**
    - [ ] Add, delete, check items in MyList.
    - [ ] Get all MyList items (with movie/TV details, pagination, watch history inclusion).
*   **`notifications.py` (User and Admin Notifications):**
    - [ ] Admin: CRUD for notifications, stats, filtering, bulk delete, broadcast.
    - [ ] User: Get notifications, unread count, mark as read/all read.
*   **`search.py` (Search - DB based):**
    - [ ] Autocomplete, advanced search (movies/TV shows).
*   **`shows.py` (TV Show Data - DB based):**
    - [ ] CRUD for shows (if applicable, mostly GET).
    - [ ] Listing, search, single show retrieval (with seasons/episodes).
    - [ ] Show existence and episode video check.
*   **`stream.py` (Video Streaming):**
    - [ ] Video streaming for movies/episodes (`/api/stream/<watch_id>`). Test different `watch_id` formats, MP4/AVI, mimetypes, non-existent files.
    - [ ] Legacy video streaming (`/api/watch/<filename>`).
*   **`upload.py` (Content Upload):**
    - [ ] **Critical:** Movie upload/update/delete (metadata, video file, `force` overwrite, runtime detection, cleanup).
    - [ ] **Critical:** TV Show upload/update/delete (metadata, seasons, episodes, video files, `force` overwrite, runtime detection, cleanup).
    - [ ] Upload progress (if used).
*   **`upload_request.py` (User Upload Requests):**
    - [ ] Add, delete, check items in UploadRequest list.
    - [ ] Get all UploadRequest items.
*   **`watch_history.py` (User Watch History):**
    - [ ] Update watch history (timestamp, duration, completion).
    - [ ] Get "Continue Watching" list (test logic for completed vs. next, `get_next_episode_info` thoroughly with DB/CDN fallback).
    - [ ] Get specific watch history, show progress, next episode for show.
    - [ ] Parse `watch_id`, get history by `watch_id`.
    - [ ] Get current progress by content ID.

### C. CDN Routes (`api/cdn/`)

**General Task Structure for Endpoints:** (Same as API Routes)

**Key Areas to Cover in CDN Routes:**

*   **`cdn_admin.py` (CDN Admin Operations):**
    - [ ] Update/Delete CDN content (movies/TV shows in JSON files, image files, in-memory data).
*   **`cdn.py` (General CDN Endpoints):**
    - [ ] Image serving (`/cdn/images/<path:filename>`) and existence check.
    - [ ] Get genres (unique, sorted, filtered).
    - [ ] Get combined content (admin view, paginated, filtered).
*   **`movies_cdn.py` (Movie CDN Endpoints):**
    - [ ] Get all, search, single, random, similar movies from CDN JSON. Test `include_watch_history`.
*   **`tv_cdn.py` (TV Show CDN Endpoints):**
    - [ ] Get all, search, single, random, similar TV shows from CDN JSON. Test `include_watch_history`.
*   **`search_cdn.py` (Combined Search - CDN based):**
    - [ ] Autocomplete, public search, authenticated search (with watch history).

### D. Utility Functions (`api/api/utils.py`, `api/cdn/utils.py`, `api/utils/logger.py`)

- [ ] **Task:** Test each utility function.
    - **Description:** Verify function logic with various inputs, including edge cases and error conditions.
    - **Automation:** Unit tests.
    - **Key Utils to focus on:**
        - `api/utils.py`: `save_with_progress` (MP4 conversion, FFMPEG interaction), `generate_token`/`generate_admin_token`, `token_required`/`admin_token_required` decorators, `create_watch_id`/`parse_watch_id`, `serialize_watch_history` (complex logic, DB/CDN fallback), `setup_request_logging`.
        - `cdn/utils.py`: `paginate`, `calculate_similarity`, `filter_valid_genres`, `check_images_existence`.
        - `utils/logger.py`: All logging functions for correct output and formatting.

### E. General Backend Tests

- [ ] **Task:** Security Testing.
    - **Description:** Check for common vulnerabilities (SQLi, XSS, IDOR, auth bypasses). Ensure input sanitization.
    - **Automation:** Security scanning tools, manual penetration testing.
- [ ] **Task:** Performance and Load Testing.
    - **Description:** Test API response times under normal/high load for critical endpoints.
    - **Automation:** Tools like Locust, JMeter.
- [ ] **Task:** Concurrency Testing.
    - **Description:** Test scenarios with multiple users accessing/modifying data simultaneously.
    - **Automation:** Custom scripts or load testing tools.
- [ ] **Task:** Database Backup and Restore.
    - **Description:** (Operational) Ensure SQLite DB can be backed up/restored.
    - **Automation:** Scripts for backup/restore, verify data integrity.
- [ ] **Task:** Logging Verification.
    - **Description:** Ensure `amanflix.log` and `api_requests.log` capture relevant info correctly, with correct formatting and levels.
    - **Automation:** Inspect log files after test scenarios.
- [ ] **Task:** `create_superadmin.py` script.
    - **Description:** Verify script creates a superadmin correctly. Test edge cases (e.g., admin already exists).
    - **Automation:** Manual run, check DB.
- [ ] **Task:** `make_images_db.py` script.
    - **Description:** Verify script processes images and creates the JSON database correctly. Test with various image sets.
    - **Automation:** Manual run, check output JSON.

## II. Frontend Testing (`repo` directory)

### A. Main Application (`repo/src/App.js`)

- [ ] **Task:** Verify Application Initialization.
    - **Description:** App loads without console errors. IP fetching (`/ip` endpoint) and `ComingSoonPage` logic based on `AllowedIPS`.
    - **Automation:** E2E tests (Cypress/Playwright), unit tests for conditional logic.
- [ ] **Task:** Verify Scroll Behavior.
    - **Description:** Test `hide-scroll` class toggling on body during scroll events.
    - **Automation:** E2E tests.
- [ ] **Task:** Verify Analytics Session Initialization & Request Interceptor.
    - **Description:** `analytics_session_id` handling in `localStorage`. Backend calls for session creation, heartbeat, and end. `X-Session-ID` header correctly added to API requests.
    - **Automation:** E2E tests (inspect `localStorage`, network requests), mock backend API for analytics.
- [ ] **Task:** Verify Routing & `PrivateRoute`.
    - **Description:** Test all defined routes. `PrivateRoute` correctly protects routes requiring authentication and redirects unauthenticated users. `NotFoundPage` for undefined paths.
    - **Automation:** E2E tests, unit tests for `PrivateRoute` component logic.
- [ ] **Task:** Verify `ScrollToTop` HOC.
    - **Description:** Ensure navigation to new pages scrolls the window to the top.
    - **Automation:** E2E tests.
- [ ] **Task:** Verify `withSplashScreen` HOC.
    - **Description:** Splash screen displays correctly on initial load.
    - **Automation:** E2E tests.

### B. Components (`repo/src/Components/`)

**For each component (Banner, Card, ContinueWatchingSlider, EpisodeSelector, Footer, Modal, Navbar, NotificationsDropdown, SimilarVideoCard, Slider, VideoPlayer, etc.):**

- [ ] **Task:** Render Correctly with Props.
    - **Description:** Component renders as expected with default props and various valid/invalid prop combinations without errors. Visual correctness.
    - **Automation:** Snapshot tests (Jest/React Testing Library), visual regression tests.
- [ ] **Task:** State Management & Event Handling.
    - **Description:** Internal state changes correctly based on user interactions. User interactions (clicks, input, hover) trigger appropriate actions, callbacks, and UI updates.
    - **Automation:** Unit/integration tests (React Testing Library), E2E tests for complex interactions.
- [ ] **Task:** API Interactions (if any).
    - **Description:** If the component fetches data, mock API calls and verify component behavior during loading, success, and error states.
    - **Automation:** Unit/integration tests with mocked APIs.
- [ ] **Task:** Responsiveness & Accessibility (A11y).
    - **Description:** Component displays correctly and is usable on different screen sizes. Adherence to ARIA attributes, keyboard navigability, color contrast.
    - **Automation:** E2E tests resizing viewport, automated A11y checks (e.g., `axe-core`).

*   **Specific Component Focus: `VideoPlayer/`**
    - [ ] **Task:** Video Playback & Controls.
        - **Description:** Play, pause, volume adjustment, seek functionality, fullscreen mode for supported video formats (MP4, AVI via backend conversion).
        - **Automation:** E2E tests (may require advanced interaction with video elements).
    - [ ] **Task:** Buffering, Loading States, Error Handling.
        - **Description:** Correct display of loading indicators, smooth playback under normal conditions. Behavior with invalid video sources or network interruptions.
        - **Automation:** E2E tests, potentially mocking network conditions.
    - [ ] **Task:** Watch History Integration.
        - **Description:** Playback progress is accurately reported to the backend API (`/api/watch_history/update`).
        - **Automation:** E2E tests checking network requests to the watch history endpoint.

### C. Pages (`repo/src/Pages/`)

**For each page (AdminPanel, ComingSoonPage, ErrorsPages (ServiceDownPage, NotFoundPage), HelpPage, HomePage, LoginPage, MovieCategoryPage, MoviesPage, MyListPage, ProfilePage, SearchPage, ShowCategoryPage, SignupPage, TvShowsPage, WatchPage):**

- [ ] **Task:** Correct Component Composition & Data Display.
    - **Description:** All expected child components render on the page. Data fetched from APIs is displayed correctly, including handling of loading, success, and error states.
    - **Automation:** Integration tests (React Testing Library), E2E tests, mock APIs.
- [ ] **Task:** User Flows & Form Handling.
    - **Description:** Test primary user interactions and navigations within and from the page. For pages with forms (Login, Signup, Profile, Admin forms), test submission, validation logic, and user feedback (success/error messages).
    - **Automation:** E2E tests.

*   **Specific Page Focus: `AdminPanel/`**
    - [ ] **Description:** Test ALL admin functionalities accessible through the UI (user management, admin management, bug reports, upload requests, CDN data import UI if present). Verify role-based access if applicable at UI level.
    - **Automation:** Extensive E2E tests.
*   **Specific Page Focus: `HomePage/`**
    - [ ] **Description:** Sliders for different categories, banner display, "Continue Watching" section functionality. Test deep linking via `/:contentId` route.
    - **Automation:** E2E tests.
*   **Specific Page Focus: `LoginPage/`, `SignupPage/`**
    - [ ] **Description:** Form validation (email format, password strength, required fields). Successful login/signup stores token and redirects. Failed attempts show appropriate error messages.
    - **Automation:** E2E tests.
*   **Specific Page Focus: `WatchPage/` (`/watch/:watch_id`)**
    - [ ] **Description:** Correctly loads and initializes the `VideoPlayer` component based on `watch_id`. Displays related information (e.g., similar videos, episode list if applicable).
    - **Automation:** E2E tests.
*   **Specific Page Focus: `ProfilePage/`**
    - [ ] **Description:** Display user information. Test update profile functionality (if any). Test account deletion (if any).
    - **Automation:** E2E tests.
*   **Specific Page Focus: `MyListPage/`**
    - [ ] **Description:** Display items added to "My List". Test adding/removing items from other pages reflects here.
    - **Automation:** E2E tests.

### D. Services (`repo/src/services/`) & Utils (`repo/src/Utils/`)

- [ ] **Task:** Test API service functions.
    - **Description:** For each function that calls the backend API, mock the `fetch` call and verify correct endpoint, method, headers, and body are used. Test handling of successful and error responses.
    - **Automation:** Unit tests (Jest) with `fetch` mocks.
- [ ] **Task:** Test utility functions.
    - **Description:** Verify logic of each utility function with various inputs, including edge cases.
    - **Automation:** Unit tests (Jest).

### E. General Frontend Tests (`repo/`)

- [ ] **Task:** Cross-Browser Compatibility.
    - **Description:** Test core functionalities on latest versions of major browsers (Chrome, Firefox, Safari, Edge).
    - **Automation:** E2E tests run on different browser drivers (if CI setup allows).
- [ ] **Task:** Responsiveness.
    - **Description:** Entire application is usable and looks good on various screen sizes (desktop, tablet, mobile).
    - **Automation:** E2E tests with viewport resizing, manual checks.
- [ ] **Task:** Performance.
    - **Description:** Page load times, responsiveness to interactions. Identify and optimize heavy components or slow API calls.
    - **Automation:** Lighthouse scores, browser dev tools performance profiling.
- [ ] **Task:** State Management (Context/Redux if used, otherwise component state).
    - **Description:** Global/shared state is managed correctly across components and user flows.
    - **Automation:** Integration and E2E tests verifying UI consistency.
- [ ] **Task:** Error Handling & User Feedback.
    - **Description:** Graceful handling of API errors, network issues, and unexpected problems. Clear and informative messages to the user.
    - **Automation:** E2E tests simulating error conditions (e.g., mocking API to return errors).
- [ ] **Task:** Security.
    - **Description:** Check for XSS vulnerabilities (ensure user input is sanitized before display). Secure handling of auth tokens (e.g., not leaking them).
    - **Automation:** Manual review, potentially linters or static analysis tools. E2E tests attempting XSS.

## III. Amanflix Data Downloader Tool Testing (`amanflix-data-downloader/`)

### A. UI and Basic Functionality (`amanflix-data-downloader/src/App.js`)

- [ ] **Task:** Initial Render & State.
    - **Description:** All UI elements (input fields, buttons, selects, modals for export/API key/fetch all/preview) are present and correctly displayed. Default values for state variables (`query`, `dataType`, `customKeysToExclude`, `exportFormat`, `customApiKey`, filters, etc.) are correct.
    - **Automation:** Snapshot tests, unit tests for initial state.
- [ ] **Task:** Responsiveness.
    - **Description:** Test on different screen sizes (primarily desktop focus).
    - **Automation:** Manual checks, E2E if critical.

### B. API Key Management

- [ ] **Task:** API Key Modal & Input.
    - **Description:** "Set API Key" modal (`apiKeyModalVisible`) opens and closes. Custom API key (`customApiKey`) can be entered.
    - **Automation:** E2E tests, unit tests for modal state.
- [ ] **Task:** API Key Storage & Usage.
    - **Description:** API key is saved to `localStorage` (`saveApiKey`) and loaded on subsequent visits. If no custom key, the hardcoded `TMDB_API_KEY` is used.
    - **Automation:** E2E tests (checking `localStorage`), unit tests for `saveApiKey`.

### C. Data Fetching (Search Functionality - `fetchMovies`)

- [ ] **Task:** Search Input & Data Type.
    - **Description:** Typing in search bar updates `query`. Changing "Movie"/"TV" (`handleDataTypeChange`) updates `dataType` and triggers API calls.
    - **Automation:** E2E tests, unit tests for handlers.
- [ ] **Task:** API Call & Loading State.
    - **Description:** Correct TMDB API endpoint is called. `isLoading` state is true during calls, UI reflects this.
    - **Automation:** E2E tests (mocking API), unit tests for `isLoading` logic.
- [ ] **Task:** Results Display & Pagination.
    - **Description:** Fetched items displayed correctly (posters, info). `handleImageError` for missing images. Infinite scroll/pagination (`currentPage`, `totalPages`, `hasMore`, `isLoadingMore`) works.
    - **Automation:** E2E tests (mocking API with paginated data).
- [ ] **Task:** Error Handling (Fetch).
    - **Description:** Handles network errors, API errors (invalid key, rate limits), no results found.
    - **Automation:** E2E tests (mocking API error responses).
- [ ] **Task:** Client-Side Filtering.
    - **Description:** `filterAdult`. Advanced Filters (`showAdvancedFilters`, `genreFilter`, `minRatingFilter`, `yearRangeFilter`, `runtimeFilter`, `languageFilter`) work as expected. `hasActiveFilters()` logic is correct. Genres/languages populated.
    - **Automation:** Unit tests for filter logic, E2E tests applying filters.

### D. "Fetch All" Functionality (Bulk Fetching)

- [ ] **Task:** Modal & Form.
    - **Description:** "Fetch All Data" modal (`fetchAllModalVisible`) opens/closes. `fetchForm` validation.
    - **Automation:** E2E tests.
- [ ] **Task:** Fetch Methods & Configuration.
    - **Description:** Test `fetchMethod` (`popular`, `by_id_range` with `idStart`/`idEnd`). `maxConcurrentRequests`, `consecutive404Limit` are respected.
    - **Automation:** E2E tests (mocking API to control responses for these scenarios).
- [ ] **Task:** Progress & Stats.
    - **Description:** `isFetching`, `fetchProgress`, `fetchStats` (total, current page, total pages, success/error counts) are updated and displayed correctly.
    - **Automation:** E2E tests (mocking API to simulate progress).
- [ ] **Task:** Data Accumulation & Error Handling.
    - **Description:** Fetched items added to `movies` and `fetchedIds`. `failedIds` records errors. Stops after `consecutive404Limit`. `fetchedIds` prevents duplicates.
    - **Automation:** E2E tests.
- [ ] **Task:** Inclusion Options (Fetch All).
    - **Description:** `includeHebrew`, `includeKeywords`, `includeEpisodes` (for TV), `includeImages` (for download) options work.
    - **Automation:** E2E tests (verifying API params or post-processing).

### E. Item Selection

- [ ] **Task:** Select/Deselect Items.
    - **Description:** `handleSelectMovie` updates `selectedMovies`. UI indicates selection.
    - **Automation:** E2E tests, unit tests for `handleSelectMovie`.

### F. Data Formatting (`formatData`)

- [ ] **Task:** Verify `formatData` Logic.
    - **Description:** Test with various items. Exclusion of keys in `customKeysToExclude`. Output structure matches `parse_dataset.py` expectation.
    - **Automation:** Unit tests for `formatData`.

### G. Preview Functionality (`generatePreview`)

- [ ] **Task:** Preview Modal & Options.
    - **Description:** `previewVisible` controls modal. `previewAll` toggle. `previewFormat` (JSON/CSV). `previewData` correctly formatted and shown. `previewLoading` state.
    - **Automation:** E2E tests, unit tests for preview generation logic.

### H. Export Functionality (`handleExportSubmit`)

- [ ] **Task:** Export Modal & Form.
    - **Description:** `exportModalVisible` and `exportForm`. Options: `customKeysToExclude`, `exportFormat`, `customFileName`, `compactMode`.
    - **Automation:** E2E tests.
- [ ] **Task:** File Generation & Download.
    - **Description:** `isDownloading`, `downloadProgress` states. JSON (compact/pretty) and CSV (`convertToCSV`) generated correctly. Image inclusion (`includeImages`) with JSZip works, zipping data file and images. Browser prompts download.
    - **Automation:** Unit tests for `convertToCSV` and JSON formatting. E2E tests to trigger download (verifying file content is harder, may need manual check or advanced setup).
- [ ] **Task:** Error Handling (Export).
    - **Description:** Handles errors during JSZip or large data processing.
    - **Automation:** Manual tests with large data, unit tests for error paths if possible.

### I. Helper Functions (Data Downloader)

- [ ] **Task:** Test `fetchItemDetails`.
    - **Description:** Fetches details for single movie/TV show, including episodes (`includeEpisodes`).
    - **Automation:** Unit tests (mocking API).
- [ ] **Task:** Test `convertToCSV`.
    - **Description:** Test with various JSON structures (empty, complex).
    - **Automation:** Unit tests.

### J. General Tests (Data Downloader)

- [ ] **Task:** Console Errors.
    - **Description:** No unexpected console errors during operation.
    - **Automation:** Check console during E2E tests.
- [ ] **Task:** Usability.
    - **Description:** Tool is intuitive and easy to use for its purpose.
    - **Automation:** Manual QA.
- [ ] **Task:** Performance (Browser).
    - **Description:** Handles selection and processing of a few hundred items for preview/export without crashing or extreme slowdowns.
    - **Automation:** Manual tests with larger selections.

## IV. Overall & Cross-Cutting Tests

- [ ] **Task:** End-to-End User Scenarios.
    - **Description:** Test complete user flows across frontend and backend. E.g., User signs up -> logs in -> browses content -> adds to MyList -> watches a video (history updated) -> searches -> views profile -> admin logs in -> manages content -> views analytics.
    - **Automation:** E2E tests covering key user journeys.
- [ ] **Task:** Data Consistency.
    - **Description:** Ensure data is consistent between CDN JSON files, the database, and what's displayed on the frontend after operations like upload, import, edit.
    - **Automation:** E2E tests with data validation steps.
- [ ] **Task:** Documentation Review (if any).
    - **Description:** Review any user guides, API documentation, or READMEs for accuracy and completeness.
    - **Automation:** Manual review.
- [ ] **Task:** Final Build and Deployment Test (Staging/Prod).
    - **Description:** Test the final build artifacts. Test the deployment process itself. A quick smoke test on the deployed environment.
    - **Automation:** Smoke tests on deployed environment.

This list should provide a solid foundation for your QA process! Remember to prioritize based on risk and impact.
