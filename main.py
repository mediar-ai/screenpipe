# just a quick & dirty local OCR api until something cleaner is done https://github.com/louis030195/screen-pipe/issues/7
# virtualenv env
# source env/bin/activate
# pip install fastapi uvicorn pytesseract pillow
# uvicorn main:app --reload

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
import pytesseract
import io

app = FastAPI()

@app.post("/ocr/")
async def perform_ocr(file: UploadFile = File(...)):
    try:
        # Read the uploaded file
        image = Image.open(io.BytesIO(await file.read()))
        
        # Perform OCR using pytesseract
        text = pytesseract.image_to_string(image)
        
        return JSONResponse(content={"text": text})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# To run the server, use the command: uvicorn main:app --reload

