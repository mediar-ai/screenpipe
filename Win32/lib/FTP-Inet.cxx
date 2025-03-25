#ifndef UNICODE
#define UNICODE
#endif /* UNICODE */

#pragma comment(lib, "wininet.lib")

#include "../include/Network.hh"

#include <Windows.h>
#include <stdio.h>

#if defined(_WIN32) || defined(_WIN64)

VOID PrintInternetError()
{
    DWORD dwError = 0;
    WCHAR szBuffer[256];
    DWORD dwSize = sizeof(szBuffer) / sizeof(szBuffer[0]);

    if (InternetGetLastResponseInfo(&dwError, szBuffer, &dwSize)) {
        wprintf_s(L"[ERROR] :%d\n", szBuffer);
    } else {
        wprintf_s(L"[ERROR] Unknown error: %lu\n", GetLastError());
    }
}

HINTERNET OpenFTPConnection(LPCWSTR host, LPCWSTR username, LPCWSTR password)
{
	// Initialize the WinINet for FTP connection
	// The user agent is set to "Screenpipe-Exchange/1.0"
	HINTERNET hInternet = InternetOpenW(
		L"Screenpipe-Agent/1.0",
		INTERNET_OPEN_TYPE_DIRECT, 
		NULL, NULL, 0
	);

	// Check if the connection was successful
	if (hInternet == NULL) {
		PrintInternetError();
		InternetCloseHandle(hInternet);
		return NULL;
	}

    // Connect to the FTP server
	HINTERNET hFTPSession = InternetConnectW(
		hInternet,
		host,
		INTERNET_DEFAULT_FTP_PORT,
		username,
		password,
		INTERNET_SERVICE_FTP,
		INTERNET_FLAG_PASSIVE,
		0
	);

	// Check if the connection was successful
	if (hFTPSession == NULL) {
        DWORD error = GetLastError();
        wprintf_s(L"InternetConnectW failed. Error: %lu\n", error);

        switch (error) {
        case ERROR_INTERNET_NAME_NOT_RESOLVED:
            wprintf_s(L"FTP host not found.\n");
            break;
        case ERROR_INTERNET_LOGIN_FAILURE:
            wprintf_s(L"Invalid username or password.\n");
            break;
        case ERROR_INTERNET_TIMEOUT:
            wprintf_s(L"Connection timed out. Check the network.\n");
            break;
        default:
            PrintInternetError();
        }
	}

	// Print a message to indicate that the connection was successful
	wprintf_s(L"FTP Connection opened\n");
	return hFTPSession;
}

VOID UploadFile(LPCWSTR server, LPCWSTR username, LPCWSTR password, LPCWSTR screenshot_name, LPCWSTR target_folder)
{
    HINTERNET hFtpSession;
    hFtpSession = OpenFTPConnection(server, username, password);

	// Make folder if it does not exist
	if (!FTP_FolderExist(hFtpSession, target_folder)) {
		if (FtpCreateDirectoryW(hFtpSession, target_folder)) {
			wprintf_s(L"Folder created: %s\n", target_folder);
		} else {
			wprintf_s(L"Failed to create folder: %s. Error: %lu\n", target_folder, GetLastError());
		}
	}

    // Create the remote file path with the target folder
    WCHAR remoteFile[MAX_PATH];
    wcsncpy_s(remoteFile, target_folder, MAX_PATH - 1);  // Copy target folder to remoteFile
    wcsncat_s(remoteFile, L"\\", MAX_PATH - wcslen(remoteFile) - 1);  // Add folder separator
    wcsncat_s(remoteFile, screenshot_name, MAX_PATH - wcslen(remoteFile) - 1);  // Add file name to path

    // Upload file to FTP server
    if (FtpPutFile(hFtpSession, screenshot_name, remoteFile, FTP_TRANSFER_TYPE_BINARY, 0)) {
        wprintf_s(L"Successfully uploaded file: %s\n", screenshot_name);
    } else {
        wprintf_s(L"Failed to upload ERROR: %lu\n", GetLastError());
    }

    // Clean up
    CloseFTPConnection(hFtpSession);
}

// Check if the specified folder exists on the FTP server
BOOL FTP_FolderExist(HINTERNET hFTPSession, LPCWSTR foldername)
{
    WIN32_FIND_DATAW findData;
    HINTERNET hFind = FtpFindFirstFileW(
        hFTPSession,
        foldername,
        &findData,
        INTERNET_FLAG_NO_CACHE_WRITE,
        0
    );

    if (hFind != NULL) {
        wprintf_s(L"Folder found: %s\n", foldername);
        InternetCloseHandle(hFind);
        return TRUE;
    }

    DWORD error = GetLastError();
    if (error == ERROR_NO_MORE_FILES) {
        wprintf_s(L"Folder not found: %s\n", foldername);
        return FALSE;
    }

    return FALSE;
}

// Close connection to the FTP server
BOOL CloseFTPConnection(HINTERNET hConnection)
{
	if (hConnection != NULL) {
		return InternetCloseHandle(hConnection);
	}
	return FALSE;
}

#endif /* defined(_WIN32) || defined(_WIN64) */