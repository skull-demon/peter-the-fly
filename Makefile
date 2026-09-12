.PHONY: install download-data verify-data train build run-demo run-tests start-frontend clean

install:
	npm install
	python -m pip install -r requirements.txt

download-data:
	python scripts/build_brain.py

verify-data:
	python scripts/verify_brain.py

train:
	python scripts/train_readout.py

build:
	npm run build

run-demo: build
	npm run preview

run-tests: verify-data
	pytest
	npm run test:web

start-frontend:
	npm run dev

clean:
	rm -rf dist web/tests/.brain.build.mjs
