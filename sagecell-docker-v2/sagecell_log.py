import json
import logging
import sys

LOG_LEVEL = logging.WARNING
LOG_VERSION = 0

class StatsMessage(object):
    def __init__(self, kernel_id, code, execute_type, remote_ip, referer):
        self.msg = [LOG_VERSION, remote_ip, referer, execute_type, kernel_id, code]

    def __str__(self):
        return json.dumps(self.msg)

formatter = logging.Formatter(
    "%(asctime)s %(process)5d %(name)-28s %(levelname)s %(message)s"
)

_original_stdout = sys.stdout
handler = logging.StreamHandler(_original_stdout)
handler.setFormatter(formatter)

root = logging.getLogger()
root.handlers[:] = []
root.addHandler(handler)
root.setLevel(LOG_LEVEL)

logger = logging.getLogger("sagecell")
permalink_logger = logger.getChild("permalink")
stats_logger = logger.getChild("stats")
kernel_logger = logger.getChild("kernel")
provider_logger = logger.getChild("provider")

# Xronos support correlation is intentionally logged at INFO without lowering
# the global SageCell WARNING threshold. The value is an opaque, validated
# per-page trace identifier and contains no Sage source or learner identity.
support_logger = logging.getLogger("sagecell.support")
support_logger.handlers[:] = []
support_logger.addHandler(handler)
support_logger.setLevel(logging.INFO)
support_logger.propagate = False

class TornadoFilter(logging.Filter):
    def filter(self, record):
        return len(record.args) != 3 or record.args[:2] != (200, 'OPTIONS / (10.0.3.1)')

logging.getLogger("tornado.access").addFilter(TornadoFilter())

class StdLog(object):
    def __init__(self, logger, level):
        self.logger = logger
        self.level = level

    def fileno(self):
        return 1

    def flush(self):
        pass

    def write(self, data):
        data = data.rstrip()
        if data:
            self.logger.log(self.level, data)

def std_redirect(logger):
    sys.stdout = StdLog(logger.getChild("stdout"), logging.DEBUG)
    sys.stderr = StdLog(logger.getChild("stderr"), logging.WARNING)
