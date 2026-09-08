# SubTrak

Capstone project.

## Group Members

1. Hassan Khan
2. Christian Pivaral
3. Ankit Dhakal

## Proposed Ideas

1. Subtrak
2. LabelLens
3. WhyWait

## Tech Stack

- Python 3.11+
- Django 6.1
- SQLite (development)

## Project Structure

```
.
├── config/         # Django project settings, root URLconf, WSGI/ASGI entry points
├── core/           # Primary Django app (views, templates, models)
├── manage.py       # Django's command-line utility
├── requirements.txt
└── .env.example    # Template for local environment variables
```

## Getting Started

### Prerequisites

- Python 3.11 or later
- pip

### Setup

1. Clone the repository and move into it:

   ```bash
   git clone <repo-url>
   cd "Capstone Project"
   ```

2. Create and activate a virtual environment:

   ```bash
   python -m venv venv

   # Windows (PowerShell)
   venv\Scripts\Activate.ps1

   # Windows (Git Bash) / macOS / Linux
   source venv/Scripts/activate   # Git Bash on Windows
   source venv/bin/activate       # macOS / Linux
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

5. Apply database migrations:

   ```bash
   python manage.py migrate
   ```

6. Create an admin account (optional, for `/admin`):

   ```bash
   python manage.py createsuperuser
   ```

7. Run the development server:

   ```bash
   python manage.py runserver
   ```

   Visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/) to confirm it's running.

## Environment Variables

Configured via `.env` (see `.env.example`):

| Variable                 | Description                              | Default                    |
|---------------------------|-------------------------------------------|-----------------------------|
| `DJANGO_SECRET_KEY`       | Secret key used for cryptographic signing | insecure dev key (generated)|
| `DJANGO_DEBUG`            | Enables Django debug mode                 | `True`                      |
| `DJANGO_ALLOWED_HOSTS`    | Comma-separated list of allowed hosts     | empty                       |

Never commit a real `.env` file or production secret key.

## Common Commands

| Command                                   | Description                          |
|--------------------------------------------|---------------------------------------|
| `python manage.py runserver`               | Start the local development server    |
| `python manage.py migrate`                 | Apply database migrations             |
| `python manage.py makemigrations`          | Create new migrations from model changes |
| `python manage.py createsuperuser`         | Create an admin user                  |
| `python manage.py startapp <name>`         | Scaffold a new Django app             |
| `python manage.py test`                    | Run the test suite                    |
