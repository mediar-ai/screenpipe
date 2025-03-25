#ifndef UNICODE
#define UNICODE
#endif /* UNICODE */

#if defined(_WIN32) || defined(_WIN64)

#include "Argument.hh"
#include <wininet.h>

#pragma comment(lib, "wininet.lib")

#include "../include/Network.hh"
#include "../include/Media-Capture.hh"

int wmain(int argc, LPCWSTR argv[]){

	ArgumentUsage(argv[1]);

	LPCWSTR server = argv[1];
	LPCWSTR username = argv[2];
	LPCWSTR password = argv[3];
	LPCWSTR screenshot_name = argv[4];
	LPCWSTR target_folder = argv[5];

	// Upload the screenshot
    CaptureAndSaveDesktop(screenshot_name);

	UploadFile(server, username, password, screenshot_name, target_folder);

	return 0;
}

#endif /* defined(_WIN32) || defined(_WIN64) */