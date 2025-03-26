#ifndef NETWORK_HH
#define NETWORK_HH

#if defined(_WIN32) || defined(_WIN64)

#include <windows.h>
#include <winnt.h>
#include <wininet.h>

HINTERNET OpenFTPConnection(LPCWSTR host, LPCWSTR username, LPCWSTR password);
BOOL SendFileViaFTP(HANDLE hConnection, LPCWSTR localFile, LPCWSTR remoteFile);
BOOL CloseFTPConnection(HINTERNET hConnection);

VOID UploadFile(LPCWSTR server, LPCWSTR username, LPCWSTR password, LPCWSTR screenshot_name, LPCWSTR target_folder);
BOOL FTP_FolderExist(HINTERNET hFTPSession, LPCWSTR foldername);

#endif /* defined(_WIN32) || defined(_WIN64) */
#endif /* NETWORK_HH */