function deleteIfCurrent(map, key, value) {
    if (map.get(key) === value) map.delete(key);
}

function createEngineLifecycle({ enginePool, activeChildren }) {
    function register(convId, engine) {
        enginePool.set(convId, engine);
        activeChildren.set(convId, engine.child);
    }

    function remove(convId, engine) {
        deleteIfCurrent(enginePool, convId, engine);
        deleteIfCurrent(activeChildren, convId, engine.child);
    }

    function kill(convId, engine = enginePool.get(convId)) {
        if (!engine) return;
        try { engine.child.stdin.end(); } catch (_) {}
        try { engine.child.kill(); } catch (_) {}
        remove(convId, engine);
    }

    function shutdown() {
        for (const [convId, engine] of Array.from(enginePool.entries())) {
            kill(convId, engine);
        }
    }

    return { register, remove, kill, shutdown };
}

function createBridgeShutdown({ server, shutdownEngines }) {
    let shutdownPromise;
    return function shutdown() {
        if (shutdownPromise) return shutdownPromise;
        shutdownPromise = new Promise((resolve, reject) => {
            const finish = (closeError) => {
                let engineError;
                try { shutdownEngines(); } catch (error) { engineError = error; }
                if (closeError || engineError) reject(closeError || engineError);
                else resolve();
            };
            if (!server || typeof server.close !== 'function') {
                finish();
                return;
            }
            try {
                server.close(finish);
            } catch (error) {
                finish(error);
            }
        });
        return shutdownPromise;
    };
}

function createQuitCoordinator({ shutdown, quit, logError = () => {} }) {
    let readyToQuit = false;
    let pending;
    return function onBeforeQuit(event) {
        if (readyToQuit) return;
        event.preventDefault();
        if (pending) return;
        pending = Promise.resolve()
            .then(shutdown)
            .catch(logError)
            .finally(() => {
                readyToQuit = true;
                quit();
            });
    };
}

module.exports = { createEngineLifecycle, createBridgeShutdown, createQuitCoordinator };
