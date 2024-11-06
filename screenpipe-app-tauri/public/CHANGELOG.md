### **New Features**
- **Intel MKL Support**: Introduced support for Intel Math Kernel Library (MKL) acceleration on macOS, Windows, and Linux, enhancing computational performance significantly.
- **Timeline UI Revamp**: Released a new timeline user interface for improved content organization and navigation, enhancing user interaction within the app.

### **Improvements**
- **Brew Version Update**: Ensured compatibility and optimized performance by updating Brew to version 0.1.97 on x86_64 and aarch64 Apple Darwin systems.
- **Search Enhancement**: Improved UI search functionality to handle scenarios with no audio path, simplifying content location in the application.

### **Fixes**
- **Documentation Clarification**: Addressed and fixed a documentation issue, providing users with accurate and clear guidance.
- **CSS and Reddit Pipe Fixes**: Resolved layout consistency issues and corrected a minor bug in the Reddit pipe functionality for a smoother user experience.
- **CI Pipeline Stability**: Enhanced stability in the continuous integration pipeline for more reliable testing and deployment processes.
- **Endpoint JSON Parsing**: Fixed a bug affecting endpoint JSON parsing, resulting in improved data handling.

### **Others**
- **Database Enhancements**: Made the `audio_chunk_id` not nullable in the `audio_transcriptions` table for improved data consistency, and added a new endpoint to the database.
- **Entelligence Removal**: Deprecated the entelligence feature, ensuring cleaner and more efficient app performance.
- **Code Cleanup and Refactoring**: Conducted various code cleanup and refactoring tasks to enhance code quality and maintainability.

#### **Full Changelog:** [v0.1.97...v0.1.98](https://github.com/mediar-ai/screenpipe/compare/v0.1.97...v0.1.98)

