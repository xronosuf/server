import os
from config_default import *

requires_tos = False

dir = os.environ.get("SAGECELL_WORKDIR", "/tmp/sagecell")
pid_file = "/tmp/sagecell.pid"
permalink_pid_file = "/tmp/sagecell_permalink_server.pid"

db = "sqlalchemy"
db_config = {"uri": "sqlite:////var/lib/sagecell/sqlite.db"}
permalink_server = {
    "db": "sqlalchemy",
    "db_config": {"uri": "sqlite:////var/lib/sagecell/sqlite.db"},
}

provider_settings = {
    "max_kernels": int(os.environ.get("SAGECELL_MAX_KERNELS", "4")),
    "max_preforked": int(os.environ.get("SAGECELL_MAX_PREFORKED", "1")),
    "preforked_rlimits": {
        "RLIMIT_CPU": int(os.environ.get("SAGECELL_RLIMIT_CPU", "30")),
    },
}

sage = os.environ.get("SAGE_BIN", "sage")
provider_info = {
    "host": "localhost",
    "username": "root",
    "python": sage + " -python",
    "location": os.path.dirname(os.path.abspath(__file__)),
}
providers = [provider_info]
