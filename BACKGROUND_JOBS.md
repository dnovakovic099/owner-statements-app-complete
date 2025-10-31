# Background Jobs Feature

## Overview

Bulk statement generation for all owners can take a very long time (minutes to hours depending on the number of properties). To prevent HTTP timeouts and improve user experience, this feature now runs as a background job.

## How It Works

### When User Selects "Generate All"

1. **User clicks "Generate All" checkbox** in the Generate Statement modal
2. **Request is sent** to `/api/statements/generate` with `ownerId: 'all'`
3. **Server immediately responds** with HTTP 202 (Accepted) and a job ID:
   ```json
   {
     "message": "Bulk statement generation started in background",
     "jobId": "job_1_1234567890",
     "status": "processing",
     "note": "This may take several minutes to complete...",
     "statusUrl": "/api/statements/jobs/job_1_1234567890"
   }
   ```
4. **Background job runs** independently, processing all owners and properties
5. **User is notified** to check back later and can close the window

### Background Processing

The background job:
- ✅ Fetches all owners and their properties from Hostify
- ✅ Generates statements for each property with activity
- ✅ Tracks progress (processed count / total properties)
- ✅ Collects results, skipped items, and errors
- ✅ Updates job status throughout the process
- ✅ Auto-cleans up after 1 hour

### Checking Job Status

Users can check job progress via:
```bash
GET /api/statements/jobs/:jobId
```

Response:
```json
{
  "id": "job_1_1234567890",
  "type": "bulk_statement_generation",
  "status": "processing",  // or "completed", "failed", "queued"
  "progress": 15,           // Current progress
  "total": 50,              // Total items to process
  "startedAt": "2025-10-31T13:20:00.000Z",
  "completedAt": null,
  "result": null,           // Populated when completed
  "error": null,
  "params": {
    "startDate": "2025-10-01",
    "endDate": "2025-10-31",
    "calculationType": "checkout"
  }
}
```

When completed:
```json
{
  "status": "completed",
  "result": {
    "summary": {
      "generated": 45,
      "skipped": 5,
      "errors": 0
    },
    "results": {
      "generated": [...],
      "skipped": [...],
      "errors": []
    }
  }
}
```

## User Experience

### Modal Flow

1. User opens "Generate Statement" modal
2. Checks "Generate All Owner Statements" checkbox
3. Selects date range and calculation type
4. Clicks "Generate"
5. **Loading spinner appears**: "Generating Statements for All Owners..."
6. **Alert shows**:
   ```
   🚀 Bulk Statement Generation Started!
   
   This process is running in the background and may take 
   several minutes to complete.
   
   ✅ You can close this window and check back later.
   📊 The statements will appear in the list once generation 
      is complete.
   
   Tip: Refresh the page to see newly generated statements.
   ```
7. Modal closes automatically
8. User can continue using the app
9. **Refresh page** to see newly generated statements

### Single Statement Generation

Single statements (one owner/property) still generate synchronously:
- No background job
- Immediate response
- Modal closes after completion
- Alert shows: "✅ Statement generated successfully"

## Technical Details

### BackgroundJobService

**Location**: `src/services/BackgroundJobService.js`

**Features**:
- In-memory job tracking (Map-based storage)
- Job lifecycle management (queued → processing → completed/failed)
- Progress tracking
- Auto-cleanup after 1 hour
- Singleton pattern

**Methods**:
- `createJob(type, params)` - Create new job
- `startJob(jobId, total)` - Mark job as started
- `updateProgress(jobId, progress)` - Update progress
- `completeJob(jobId, result)` - Mark as completed
- `failJob(jobId, error)` - Mark as failed
- `getJob(jobId)` - Get job status
- `runInBackground(type, jobFunction, params)` - Run function in background

### API Endpoints

**POST /api/statements/generate**
- If `ownerId === 'all'`: Returns job ID (202 Accepted)
- Otherwise: Generates statement immediately (201 Created)

**GET /api/statements/jobs/:jobId**
- Returns current job status
- Used for polling or manual status checks

### Frontend Changes

**Dashboard.tsx**:
- Handles both sync and async responses
- Shows different messages for background jobs
- Refreshes statements after 3 seconds for background jobs
- Re-throws errors to keep modal open on failure

**GenerateModal.tsx**:
- Loading state with spinner
- Disables form during generation
- Shows "Generating..." message
- Auto-closes on success
- Stays open on error

**api.ts**:
- Updated TypeScript types to include `jobId` and `status` fields
- Supports both old and new response formats

## Benefits

✅ **No Timeouts**: Long-running jobs don't timeout HTTP requests
✅ **Better UX**: Users aren't blocked waiting for completion
✅ **Scalability**: Can process hundreds of properties without issues
✅ **Progress Tracking**: Job status can be monitored
✅ **Error Handling**: Individual property failures don't stop the entire job
✅ **Non-Blocking**: Users can continue using the app during generation

## Future Enhancements

Potential improvements:
- 🔄 Real-time progress updates via WebSockets
- 💾 Persistent job storage (database instead of memory)
- 📧 Email notifications when jobs complete
- 📊 Job history and analytics
- ⏸️  Job cancellation support
- 🔄 Auto-retry failed items
- 📈 Progress bar in UI

## Deployment Notes

### Railway

The background job system works seamlessly on Railway:
- No additional configuration needed
- Jobs run in the same process as the server
- Memory-based storage is fine for single-instance deployments

### Scaling Considerations

If you need to scale to multiple instances:
- Consider using Redis for job storage
- Implement a proper job queue (Bull, Bee-Queue)
- Use worker processes separate from web processes

## Testing

### Local Testing

1. Start the server: `npm start`
2. Open the app and go to Generate Statement
3. Check "Generate All Owner Statements"
4. Select date range and click Generate
5. Check backend logs for progress:
   ```bash
   tail -f /tmp/backend.log
   ```
6. You'll see:
   - Job creation
   - Progress updates
   - Statement generation logs
   - Completion message

### Manual API Testing

```bash
# Start bulk generation
curl -X POST http://localhost:3003/api/statements/generate \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "all",
    "startDate": "2025-10-01",
    "endDate": "2025-10-31",
    "calculationType": "checkout"
  }'

# Check job status
curl http://localhost:3003/api/statements/jobs/job_1_1234567890
```

## Summary

The background jobs feature ensures that bulk statement generation can handle any number of properties without timing out or blocking the user. Users are informed that the process is running in the background and can check back later for results.

