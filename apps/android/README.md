# BD Phone Bridge — Android App

Sideloaded Android app for Samsung Galaxy S24 that captures SMS, call logs, and location for FieldOps.

## Setup

1. Open this folder in Android Studio
2. Build the APK: Build > Build Bundle(s) / APK(s) > Build APK(s)
3. Transfer APK to Galaxy S24
4. Enable "Install from unknown sources" for your file manager
5. Install the APK

## Device Registration

1. In FieldOps web app (admin), go to Settings > Phone Bridge
2. Click "Register Device" — you'll get a `pbd_...` token
3. Open BD Phone Bridge on the phone
4. Paste the token and tap "Register Device"
5. Grant all requested permissions

## Features

- **SMS Capture**: Intercepts incoming SMS and monitors outbound
- **Call Log**: Watches for new calls (especially missed)
- **Auto-Reply**: Sends configurable auto-texts for missed calls and after-hours
- **Draft Approval**: Shows notification when Claude drafts a reply for approval
- **Geofence**: Monitors active job locations for arrival/departure
- **Offline Queue**: Stores data locally when no connection, syncs when back online

## Architecture

```
SmsReceiver (BroadcastReceiver) → ApiClient → FieldOps /ingest/messages
CaptureService (ForegroundService) → Call log observer → /ingest/calls
                                   → SMS observer (outbound) → /ingest/messages
                                   → Periodic sync → /device/sync
WorkManager → Retry failed uploads from offline queue
```

## Permissions Required

- RECEIVE_SMS, READ_SMS, SEND_SMS — message capture and auto-reply
- READ_CALL_LOG — missed call detection
- READ_CONTACTS — skip personal contacts for auto-reply
- ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION — geofencing
- CAMERA — receipt capture
- POST_NOTIFICATIONS — draft approval notifications
