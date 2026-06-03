from pathlib import Path
import re

# --------------------------------------------------------------------
# Patch web_server.py:
# Start kernel providers locally instead of through SSH.
# --------------------------------------------------------------------

web_server = Path("/opt/sagecell/web_server.py")
s = web_server.read_text()

marker = 'if __name__ == "__main__":'
if marker not in s:
    raise SystemExit("Could not find main block marker in web_server.py")

provider_patch = r'''
# --- container-local provider patch ---
# Upstream SageCell starts kernel providers over SSH. For this single-container
# service-only deployment, run kernel_provider.py as a local subprocess instead.
_provider_processes = []

def start_providers(port, providers, dir):
    import atexit
    import os
    import shlex
    import subprocess

    global _provider_processes

    for config in providers:
        location = config["location"]
        python_cmd = shlex.split(config["python"])
        command = python_cmd + [
            os.path.join(location, "kernel_provider.py"),
            "--address=127.0.0.1",
            str(port),
            dir,
        ]

        logger.debug("starting local kernel provider: %s", command)

        proc = subprocess.Popen(
            command,
            cwd=location,
            stdout=open("/proc/1/fd/1", "ab", buffering=0),
            stderr=open("/proc/1/fd/2", "ab", buffering=0),
            close_fds=True,
        )
        _provider_processes.append(proc)

    def stop_provider_processes():
        for proc in _provider_processes:
            if proc.poll() is None:
                try:
                    proc.terminate()
                except Exception:
                    pass

    atexit.register(stop_provider_processes)

# --- end container-local provider patch ---

'''

if "container-local provider patch" not in s:
    s = s.replace(marker, provider_patch + marker, 1)

web_server.write_text(s)

# --------------------------------------------------------------------
# Patch handlers.py:
# 1. Add modern Jupyter message version fields to manually-built messages.
# 2. Make /service capture execute_result/display_data, not only stream output.
# --------------------------------------------------------------------

handlers = Path("/opt/sagecell/handlers.py")
h = handlers.read_text()

# Replace ZMQChannelsHandler.send. This preserves the execution counter behavior
# but adds modern Jupyter message fields before kernel.session.send(...).
new_send = '''    def send(self, msg):
        # Useful but may be way too verbose even for debugging
        #logger.debug("sending to kernel %s", msg)

        # Container compatibility patch for modern jupyter_client/ipykernel.
        # SageCell builds some messages by hand. Ensure they look like
        # Jupyter v5 messages before Session.send serializes them.
        from jupyter_client.session import utcnow

        msg.setdefault("parent_header", {})
        msg.setdefault("metadata", {})
        msg.setdefault("content", {})

        header = msg.setdefault("header", {})
        header.setdefault("version", "5.3")
        header.setdefault("date", utcnow())

        if "msg_type" not in msg and "msg_type" in header:
            msg["msg_type"] = header["msg_type"]

        for f in self.msg_to_kernel_callbacks:
            f(msg)
        kernel = self.kernel

        if msg['header']['msg_type'] in ('execute_request', 'sagenb.interact.update_interact'):
            kernel.executing += 1
            logger.debug("increased execution counter for %s to %s",
                         kernel.id, kernel.executing)
        kernel.session.send(kernel.channels["shell"], msg)

'''

if "Container compatibility patch for modern jupyter_client/ipykernel" not in h:
    send_pattern = re.compile(
        r'(class ZMQChannelsHandler\(object\):[\s\S]*?)'
        r'    def send\(self, msg\):[\s\S]*?'
        r'(?=\nclass ZMQServiceHandler\(ZMQChannelsHandler\):)',
        re.MULTILINE
    )
    h, n = send_pattern.subn(r'\1' + new_send, h, count=1)
    if n != 1:
        raise SystemExit("Could not replace ZMQChannelsHandler.send method.")

# Replace ZMQServiceHandler so /service captures bare expression results.
new_service = '''class ZMQServiceHandler(ZMQChannelsHandler):
    def __init__(self):
        super(ZMQServiceHandler, self).__init__()
        self.streams = collections.defaultdict(str)

    def output_message(self, msg):
        if msg["channel"] != "iopub":
            return

        msg_type = msg["header"]["msg_type"]

        if msg_type == "stream":
            self.streams[msg["content"]["name"]] += msg["content"]["text"]
            return

        # Container/Xronos compatibility patch:
        # Upstream /service captures stream output, but the old embedded-kernel
        # Xronos path used execute_result text/plain for bare Sage expressions.
        # Preserve that value explicitly and also append it to stdout so simple
        # service clients see the same visible result as a notebook cell.
        if msg_type in ("execute_result", "display_data"):
            data = msg["content"].get("data", {})
            text = data.get("text/plain")
            if text is not None:
                self.streams["execute_result"] = text
                self.streams["stdout"] += text + chr(10)
            return

'''

if "Container/Xronos compatibility patch" not in h:
    service_pattern = re.compile(
        r'class ZMQServiceHandler\(ZMQChannelsHandler\):[\s\S]*?'
        r'(?=\nclass SockJSChannelsHandler\(ZMQChannelsHandler\):)',
        re.MULTILINE
    )
    h, n = service_pattern.subn(new_service, h, count=1)
    if n != 1:
        raise SystemExit("Could not replace ZMQServiceHandler class.")

handlers.write_text(h)
