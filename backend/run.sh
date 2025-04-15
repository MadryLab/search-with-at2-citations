#!/bin/bash
# Install dependencies
# pip install -r requirements.txt

# Run the FastAPI server
# uvicorn main:app --host 0.0.0.0 --port 8000 --reload 

# HTTPS version with self-signed certificates
python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 \
  --ssl-keyfile=/etc/apache2/md/domains/deep-chungus-9.csail.mit.edu/privkey.pem \
  --ssl-certfile=/etc/apache2/md/domains/deep-chungus-9.csail.mit.edu/pubcert.pem
