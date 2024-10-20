"""
virtualenv env
source env/bin/activate
pip install torch transformers autofaiss opencv-python-headless pillow fire
"""

import os
import sqlite3
import numpy as np
import faiss
from autofaiss import build_index
import cv2
from transformers import CLIPProcessor, CLIPModel
import torch
from tqdm import tqdm
import fire
import time
from collections import defaultdict

# Set up paths
HOME = os.path.expanduser("~")
DB_PATH = os.path.join(HOME, ".screenpipe", "db.sqlite")
INDEX_PATH = os.path.join(HOME, ".screenpipe", "faiss_index")
BATCH_SIZE = 10_000  # Adjust this based on your available memory

# Check if MPS is available
if torch.backends.mps.is_available():
    device = torch.device("mps")
    print("Using MPS (Metal) backend")
else:
    device = torch.device("cpu")
    print("MPS not available, using CPU")

# Initialize CLIP model for text embeddings
clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# Function to extract frame from video
def extract_frame(video_path, frame_number=0):
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
    ret, frame = cap.read()
    cap.release()
    return frame if ret else None

def get_text_embedding(text):
    inputs = clip_processor(text=text, return_tensors="pt", padding=True, truncation=True, max_length=77)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        text_features = clip_model.get_text_features(**inputs)
    return text_features.cpu().numpy().flatten()

def process_batch(batch):
    embeddings = []
    metadata = []
    for row in batch:
        frame_id, timestamp, ocr_text, transcription = row
        combined_text = f"{ocr_text or ''} {transcription or ''}".strip()
        if combined_text:
            embedding = get_text_embedding(combined_text)
            embeddings.append(embedding)
            metadata.append({
                "frame_id": frame_id,
                "timestamp": timestamp,
                "text": combined_text
            })
    return np.array(embeddings).astype('float32'), metadata

def create_index(embeddings, metadata):
    index, _ = build_index(
        embeddings,
        save_on_disk=True,
        index_path=INDEX_PATH,
        index_infos_path=f"{INDEX_PATH}_infos.json",
        metric_type="ip"
    )
    return index

def text_search(query_text, index, metadata, k=5):
    query_embedding = get_text_embedding(query_text)
    D, I = index.search(query_embedding.reshape(1, -1), k)
    results = []
    for i in range(k):
        results.append({
            "score": float(D[0][i]),
            "frame_id": metadata[I[0][i]]["frame_id"],
            "timestamp": metadata[I[0][i]]["timestamp"],
            "text": metadata[I[0][i]]["text"]
        })
    return results

class ScreenpipeSearch:
    def __init__(self):
        self.device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
        print(f"Using device: {self.device}")
        self.clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(self.device)
        self.clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        self.index = None
        self.metadata = None
        self.timings = defaultdict(float)

    def get_text_embedding(self, text):
        inputs = self.clip_processor(text=text, return_tensors="pt", padding=True, truncation=True, max_length=77)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            text_features = self.clip_model.get_text_features(**inputs)
        return text_features.cpu().numpy().flatten()

    def time_function(self, func, *args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        func_name = func.__name__
        self.timings[func_name] += end_time - start_time
        return result

    def process_batch(self, batch):
        return self.time_function(self._process_batch, batch)

    def _process_batch(self, batch):
        embeddings = []
        metadata = []
        for row in batch:
            frame_id, timestamp, ocr_text, transcription = row
            combined_text = f"{ocr_text or ''} {transcription or ''}".strip()
            if combined_text:
                embedding = self.get_text_embedding(combined_text)
                # Ensure the embedding is 2D
                if embedding.ndim == 1:
                    embedding = embedding.reshape(1, -1)
                embeddings.append(embedding)
                metadata.append({
                    "frame_id": frame_id,
                    "timestamp": timestamp,
                    "text": combined_text
                })
        return np.vstack(embeddings).astype('float32'), metadata

    def build(self):
        start_time = time.time()
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT COUNT(*)
            FROM frames f
            LEFT JOIN ocr_text o ON f.id = o.frame_id
            LEFT JOIN audio_transcriptions a ON f.timestamp = a.timestamp
        """)
        total_rows = cursor.fetchone()[0]

        all_embeddings = []
        all_metadata = []

        cursor.execute("""
            SELECT f.id, f.timestamp, o.text AS ocr_text, a.transcription
            FROM frames f
            LEFT JOIN ocr_text o ON f.id = o.frame_id
            LEFT JOIN audio_transcriptions a ON f.timestamp = a.timestamp
            ORDER BY f.timestamp
        """)
        all_data = cursor.fetchall()
        conn.close()

        self.timings['database_query'] = time.time() - start_time

        total_rows = len(all_data)
        with tqdm(total=total_rows, desc="Processing data") as pbar:
            for i in range(0, total_rows, BATCH_SIZE):
                batch = all_data[i:i+BATCH_SIZE]
                embeddings, metadata = self.process_batch(batch)
                all_embeddings.append(embeddings)
                all_metadata.extend(metadata)
                pbar.update(len(batch))

        self.timings['data_processing'] = time.time() - start_time - self.timings['database_query']

        final_embeddings = np.concatenate([e if e.ndim == 2 else e.reshape(1, -1) for e in all_embeddings])

        index_start_time = time.time()
        self.index = faiss.IndexFlatIP(final_embeddings.shape[1])
        self.index.add(final_embeddings)
        self.timings['indexing'] = time.time() - index_start_time

        save_start_time = time.time()
        faiss.write_index(self.index, INDEX_PATH)
        np.save(f"{INDEX_PATH}_metadata.npy", all_metadata)
        self.timings['saving'] = time.time() - save_start_time

        total_time = time.time() - start_time
        self.timings['total'] = total_time

        print(f"Index built and saved to {INDEX_PATH}")
        self.print_timings()

    def print_timings(self):
        print("\nTiming breakdown:")
        for key, value in self.timings.items():
            print(f"{key}: {value:.2f} seconds")

    def estimate_total_time(self, sample_size=1000):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM frames")
        total_rows = cursor.fetchone()[0]
        
        cursor.execute(f"""
            SELECT f.id, f.timestamp, o.text AS ocr_text, a.transcription
            FROM frames f
            LEFT JOIN ocr_text o ON f.id = o.frame_id
            LEFT JOIN audio_transcriptions a ON f.timestamp = a.timestamp
            ORDER BY RANDOM()
            LIMIT {sample_size}
        """)
        sample_data = cursor.fetchall()
        conn.close()

        start_time = time.time()
        self.process_batch(sample_data)
        sample_time = time.time() - start_time

        estimated_time = (sample_time / sample_size) * total_rows

        print(f"\nEstimated total processing time: {estimated_time:.2f} seconds")
        print(f"Estimated total processing time: {estimated_time/60:.2f} minutes")
        print(f"Estimated total processing time: {estimated_time/3600:.2f} hours")

        return estimated_time

    def load(self):
        self.index = faiss.read_index(INDEX_PATH)
        # Load metadata as a list
        self.metadata = np.load(f"{INDEX_PATH}_metadata.npy", allow_pickle=True).tolist()
        print(f"Index loaded from {INDEX_PATH}")

    def search(self, query_text, k=5):
        if self.index is None:
            self.load()

        query_embedding = self.get_text_embedding(query_text)
        D, I = self.index.search(query_embedding.reshape(1, -1), k)
        
        results = [
            {
                "score": float(D[0][i]),
                "frame_id": self.metadata[I[0][i]]["frame_id"],
                "timestamp": self.metadata[I[0][i]]["timestamp"],
                "text": self.metadata[I[0][i]]["text"]
            }
            for i in range(k)
        ]
        return results

def build():
    searcher = ScreenpipeSearch()
    searcher.estimate_total_time()
    searcher.build()

def search(query, k=5):
    searcher = ScreenpipeSearch()
    results = searcher.search(query, k)
    for result in results:
        print(f"Score: {result['score']}")
        print(f"Frame ID: {result['frame_id']}")
        print(f"Timestamp: {result['timestamp']}")
        print(f"Text: {result['text']}")
        print("---")

if __name__ == "__main__":
    fire.Fire({
        "build": build,
        "search": search
    })
