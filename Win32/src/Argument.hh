#ifndef UNICODE
#define UNICODE
#endif /* UNICODE */

#if defined(_WIN32) || defined(_WIN64)

#include <windows.h>
#include <winbase.h>
#include <wingdi.h>

#include <stdio.h>

// Argument usage for the program to display help
inline VOID ArgumentUsage(LPCWSTR lpValue) {
	LPCWSTR lpUsage = L"help";
	if (lstrcmpiW(lpValue, lpUsage) == 0) {
		printf_s("Usage: <server> <username> <password> <screenshot_name> <target_folder>\n");
		printf_s("Example: \"ftp.example.com\" \"admin\" \"admin\" \"Screenshot_1\" \"ScreenpipeFolder\" \n\n");

		printf_s("Screenshot file are only use BMP format\n");
		printf_s("FTP port only setup to 21\n");
	}
}

#endif /* defined(_WIN32) || defined(_WIN64) */