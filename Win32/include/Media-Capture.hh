#ifndef MEDIA_CAPTURE_HH
#define MEDIA_CAPTURE_HH

#if defined(_WIN32) || defined(_WIN64)

#include <windows.h>
#include <wingdi.h>

// Capture client the desktop screen
VOID CaptureAndSaveDesktop(LPCWSTR filename);

#endif /* defined(_WIN32) || defined(_WIN64) */
#endif /* MEDIA_CAPTURE_HH */