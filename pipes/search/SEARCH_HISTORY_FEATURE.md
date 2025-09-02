# Search History Feature

## Overview

The Search History feature provides a ChatGPT-like sidebar that allows users to save, browse, and restore their previous searches in the screenpipe search pipe. This feature enhances the user experience by providing easy access to search history and the ability to continue previous conversations.

## Features

### 🔍 Search History Sidebar
- **Collapsible sidebar** on the left side of the interface
- **Mobile responsive** design using shadcn Sheet component
- **Time-based grouping** (Today, Yesterday, This Week, This Month, Older)
- **Search preview** showing the first 30 characters of each query
- **Relative timestamps** (e.g., "2h ago", "Just now")

### 💾 Automatic Search Saving
- Automatically saves searches when a query is executed
- Stores search parameters, results, and AI chat messages
- Uses browser's IndexedDB via localforage for persistence
- Only saves non-empty queries to avoid clutter

### 🔄 Search Restoration
- Click any search in the history to restore it completely
- Restores all search parameters (query, dates, filters, etc.)
- Restores search results without re-querying the API
- Restores AI chat messages and conversation context
- Provides toast notification when search is restored

### 🗑️ Search Management
- Hover over any search item to reveal delete button
- Delete individual searches from history
- Search counter in sidebar footer
- Smooth animations for all interactions

## Technical Implementation

### Components

#### `SearchHistorySidebar`
- Main sidebar component with search list and grouping
- Handles search selection and deletion
- Responsive design with mobile sheet support
- Smooth animations using framer-motion

#### `useSearchHistory` Hook
- Manages search history state and persistence
- Provides functions for adding, deleting, and loading searches
- Uses localforage for browser storage
- Handles search grouping by time periods

#### `SidebarProvider` & Related Components
- Shadcn-based sidebar system with responsive behavior
- Automatic mobile detection and sheet conversion
- Keyboard shortcuts and accessibility support

### Data Structure

```typescript
interface SearchHistory {
  id: string;
  query: string;
  timestamp: string;
  searchParams: {
    q?: string;
    content_type: string;
    limit: number;
    offset: number;
    start_time: string;
    end_time: string;
    app_name?: string;
    window_name?: string;
    include_frames: boolean;
    min_length: number;
    max_length: number;
  };
  results: ContentItem[];
  messages: {
    id: string;
    type: 'search' | 'ai';
    content: string;
    timestamp: string;
  }[];
}
```

## Usage

### Opening the Sidebar
- Click the sidebar trigger button (hamburger menu) in the top-left corner
- On mobile, this opens a slide-out sheet
- On desktop, this toggles a collapsible sidebar

### Saving Searches
- Searches are automatically saved when you execute a query
- Only non-empty queries are saved to keep history clean
- Each search includes all parameters and results

### Restoring Searches
1. Open the search history sidebar
2. Browse through time-grouped searches
3. Click on any search to restore it completely
4. The search will restore query, parameters, results, and AI messages

### Managing History
- Hover over any search item to see the delete button
- Click the delete button to remove a search from history
- The sidebar footer shows the total number of saved searches

## Browser Compatibility

- **Storage**: Uses IndexedDB via localforage (supports all modern browsers)
- **Responsive**: Works on desktop, tablet, and mobile devices
- **Animations**: Uses framer-motion for smooth transitions
- **Accessibility**: Full keyboard navigation and screen reader support

## Performance Considerations

- **Lazy Loading**: Search results are stored locally, no re-querying needed
- **Efficient Storage**: Uses IndexedDB for large data storage
- **Memory Management**: Only loads visible search items
- **Debounced Operations**: Search operations are optimized to prevent spam

## Future Enhancements

- **Search within History**: Add ability to search through saved searches
- **Export/Import**: Allow users to backup and restore their search history
- **Search Categories**: Add ability to organize searches into categories
- **Shared History**: Sync search history across devices (with user consent)
- **Advanced Filters**: Filter history by date range, content type, etc.

## Troubleshooting

### Sidebar Not Appearing
- Ensure the SidebarProvider is properly wrapped around the component
- Check browser console for any JavaScript errors
- Verify that all required dependencies are installed

### Search Not Saving
- Check browser's IndexedDB support and storage permissions
- Ensure queries are non-empty (empty queries are not saved)
- Check browser console for storage-related errors

### Mobile Issues
- The sidebar automatically converts to a sheet on mobile
- Ensure proper viewport meta tag is set
- Test on actual mobile devices for best results

## Dependencies

- `@radix-ui/react-*`: UI primitives for sidebar components
- `framer-motion`: Animations and transitions
- `localforage`: Browser storage management
- `date-fns`: Date formatting and manipulation
- `lucide-react`: Icons for UI elements
