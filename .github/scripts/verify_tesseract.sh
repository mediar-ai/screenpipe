#!/bin/bash
tesseract --version
ldconfig -p | grep tesseract
ls -l /usr/lib/x86_64-linux-gnu/libtesseract*
