/**
 * Event provider to ECOMP for heartbeat message
 *
 * @author herbert
 *
 */
package org.opendaylight.mwtn.ecompConnector.impl;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

class EventProviderTask  implements Runnable {

    private static final Logger LOG = LoggerFactory.getLogger(EventProviderTask.class);

    private int t = 0;
    private final EcompMessages ecompMessages;

    EventProviderTask(EcompMessages ecompMessages) {
        LOG.info("Create eventprovider task");
        this.ecompMessages = ecompMessages;
    }

    private void sendHeartbeat() {
         String postAnswer = ecompMessages.postHeartBeat();
         LOG.debug( "Heartbeat answer {}: ",String.valueOf(postAnswer) );
    }

    @Override
    public void run() {
        LOG.debug("Ecomp provider heartbeat tick start {}", t++);

        sendHeartbeat();
    }
}
