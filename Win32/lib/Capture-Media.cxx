#ifndef UNICODE
#define UNICODE
#endif /* UNICODE */

#include "../include/Media-Capture.hh"
#include <winuser.h>
#include <stdio.h>

#pragma comment(lib, "gdi32.lib")

VOID SaveBitmapToFile(HBITMAP hBitmap, LPCWSTR filename)
{
    BITMAP bmp;
    BITMAPINFOHEADER bi;
    BITMAPFILEHEADER bfh;
    HANDLE hFile;
    DWORD dwWritten;
    HDC hdcMem;
    HGDIOBJ hOldBitmap;
    
    // Get information about the bitmap
    if (GetObject(hBitmap, sizeof(BITMAP), &bmp) == 0) {
        printf("Failed to get bitmap object\n");
        return;
    }

    // Fill BITMAPINFOHEADER structure
    bi.biSize = sizeof(BITMAPINFOHEADER);
    bi.biWidth = bmp.bmWidth;
    bi.biHeight = bmp.bmHeight;
    bi.biPlanes = 1;
    bi.biBitCount = 24;  // 24-bit RGB
    bi.biCompression = BI_RGB;  // No compression
    bi.biSizeImage = ((bmp.bmWidth * 24 + 31) / 32) * 4 * bmp.bmHeight;
    bi.biXPelsPerMeter = 0;
    bi.biYPelsPerMeter = 0;
    bi.biClrUsed = 0;
    bi.biClrImportant = 0;
    
    // Create a device context and compatible bitmap to get pixel data
    hdcMem = CreateCompatibleDC(NULL);
    hOldBitmap = SelectObject(hdcMem, hBitmap);
    
    // Allocate memory to store the image
    BYTE* lpBits = (BYTE*)malloc(bi.biSizeImage);
    if (lpBits == NULL)
    {
        printf("Error allocating memory for image data\n");
        return;
    }
    
    // Get pixel data from bitmap
    if (GetDIBits(hdcMem, hBitmap, 0, bmp.bmHeight, lpBits, (BITMAPINFO*)&bi, DIB_RGB_COLORS) == 0)
    {
        printf("Error getting DIB bits\n");
        free(lpBits);
        return;
    }
    
    // Create or open the file
    hFile = CreateFileW(filename, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE)
    {
        printf("Error creating file\n");
        free(lpBits);
        return;
    }
    
    // Fill BITMAPFILEHEADER structure
    bfh.bfType = 0x4D42;  // 'BM' in hexadecimal
    bfh.bfSize = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER) + bi.biSizeImage;
    bfh.bfReserved1 = 0;
    bfh.bfReserved2 = 0;
    bfh.bfOffBits = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
    
    // Write the file header
    WriteFile(hFile, &bfh, sizeof(BITMAPFILEHEADER), &dwWritten, NULL);
    
    // Write the bitmap info header
    WriteFile(hFile, &bi, sizeof(BITMAPINFOHEADER), &dwWritten, NULL);
    
    // Write the pixel data
    WriteFile(hFile, lpBits, bi.biSizeImage, &dwWritten, NULL);
    
    // Clean up
    CloseHandle(hFile);
    free(lpBits);
    SelectObject(hdcMem, hOldBitmap);
    DeleteDC(hdcMem);
}

VOID CaptureAndSaveDesktop(LPCWSTR filename)
{
    // Get the handle of the desktop window
    HWND hDesktopWnd = GetDesktopWindow();
    
    // Get the device context (DC) of the desktop window
    HDC hdcDesktop = GetDC(hDesktopWnd);
    
    // Get the size of the screen
    int screenWidth = GetSystemMetrics(SM_CXSCREEN);
    int screenHeight = GetSystemMetrics(SM_CYSCREEN);
    
    // Create a compatible DC to capture the screen image
    HDC hdcMem = CreateCompatibleDC(hdcDesktop);
    
    // Create a compatible bitmap
    HBITMAP hBitmap = CreateCompatibleBitmap(hdcDesktop, screenWidth, screenHeight);
    
    // Select the bitmap into the memory DC
    HGDIOBJ hOld = SelectObject(hdcMem, hBitmap);
    
    // Copy the desktop content to the bitmap using BitBlt
    BitBlt(hdcMem, 0, 0, screenWidth, screenHeight, hdcDesktop, 0, 0, SRCCOPY);
    
    // Save the bitmap to a file
    SaveBitmapToFile(hBitmap, filename);
    
    // Cleanup
    SelectObject(hdcMem, hOld);
    DeleteDC(hdcMem);
    ReleaseDC(hDesktopWnd, hdcDesktop);
}