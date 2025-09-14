# Offline Tissue Documentation

## Purpose
The Offline Tissue is the nervous system of your POS system that ensures everything keeps working even when your internet connection fails. It automatically saves all your data locally and syncs everything back to your main database when the connection returns.

## How It Works

### Offline Detection
- **Automatic Monitoring**: Continuously checks internet connection status
- **Visual Indicators**: Shows you when you're online or offline
- **Graceful Transitions**: Smoothly switches between online and offline modes
- **Connection Recovery**: Automatically detects when internet returns

### Local Data Storage
- **Complete Database**: Stores all your products, customers, and transactions locally
- **Real-time Sync**: Keeps local data updated with your main database
- **Data Persistence**: Information survives app crashes and device restarts
- **Unlimited Storage**: Uses your device's storage for offline operations

### Automatic Synchronization
- **Background Sync**: Uploads offline transactions when connection returns
- **Conflict Resolution**: Handles situations where data changed in both places
- **Progress Tracking**: Shows you the sync status and any pending uploads
- **Error Recovery**: Retries failed syncs automatically

## Key Features

**Seamless Operation**
- Sales processing continues normally even offline
- All POS features work without internet connection
- No interruption to customer service
- Automatic data backup and recovery

**Smart Data Management**
- Only syncs what has changed to save bandwidth
- Compresses data for faster uploads
- Prioritizes critical business data first
- Maintains data integrity across all operations

**Status Monitoring**
- Real-time connection status indicator
- Pending sync transaction counter
- Last successful sync timestamp
- Manual sync trigger when needed

## How to Use in the POS

### Automatic Operation
1. **No setup required** - works automatically in the background
2. **Status indicator** shows connection state in POS header  
3. **Operates transparently** - no change to normal POS workflow

### Complete Usage Flow
1. **System Startup**: Offline Tissue initializes RxDB database automatically
2. **Product Loading**: Sample products loaded from local database for immediate use
3. **Sales Processing**: All transactions saved locally whether online or offline
4. **Connection Monitoring**: Status indicator updates in real-time (green=online, red=offline)
5. **Automatic Sync**: When online, pending transactions upload to PostgreSQL automatically
6. **Manual Control**: Click sync button to force immediate synchronization if needed
7. **Error Handling**: Failed syncs retry automatically with exponential backoff

### Understanding the Status Indicator
1. **Green "Online"**: Connected to internet, data syncing normally
2. **Yellow "Syncing"**: Uploading offline transactions to server
3. **Red "Offline"**: No internet connection, storing data locally
4. **Pending Count**: Shows number of transactions waiting to sync

### During Offline Operation
1. **Continue Normal Sales**: All POS functions work without internet
2. **Process Cash Payments**: Complete transactions using local database
3. **Add New Customers**: Customer info stored locally for sync later
4. **Manage Inventory**: Stock levels updated in local database

### When Connection Returns
1. **Automatic Sync**: System detects connection and starts uploading
2. **Progress Monitoring**: Watch pending transaction count decrease
3. **Manual Sync**: Click sync button if needed to force upload
4. **Conflict Resolution**: System handles any data conflicts automatically

### Required Inputs
- **Network Connection**: Monitors internet connectivity automatically
- **Local Storage Space**: Requires browser storage for offline database
- **Transaction Data**: Takes completed sales and customer info for sync
- **System Permissions**: Needs access to browser storage and network

### Expected Outputs
- **Connection Status**: Real-time online/offline indicator
- **Sync Progress**: Count of pending transactions and sync status
- **Data Persistence**: Guaranteed local storage of all transactions
- **Error Notifications**: Alerts for sync failures or storage issues

### Common Error States
- **Storage Full**: Browser storage limit reached, prompts for cleanup
- **Sync Failed**: Network timeout or server error during data upload
- **Data Conflict**: Same transaction exists both locally and on server
- **Connection Unstable**: Frequent disconnections disrupting sync process
- **Auth Expired**: Session timeout preventing sync (when auth implemented)

### Troubleshooting Offline Issues
- **Check Status Indicator**: Confirms offline mode is active
- **Verify Local Data**: Ensure transactions are saving locally
- **Monitor Sync Progress**: Watch for successful data upload
- **Clear Browser Cache**: If sync fails repeatedly

## When to Use
- Automatically active at all times - no user action needed
- Provides backup during internet outages
- Ensures business continuity during network problems
- Protects against data loss from connection issues

## Business Benefits

**Uninterrupted Sales**
- Never lose a sale due to internet problems
- Customer checkout experience remains smooth
- Staff can continue working normally during outages
- Business operations are not dependent on internet reliability

**Data Security**
- All transactions are safely stored locally
- Multiple backup locations protect your data
- Automatic recovery from system problems
- Complete audit trail of all business activities

**Cost Savings**
- Reduces dependency on expensive internet connections
- Minimizes lost sales from network downtime
- Decreases customer wait times during connection issues
- Improves overall business efficiency and reliability