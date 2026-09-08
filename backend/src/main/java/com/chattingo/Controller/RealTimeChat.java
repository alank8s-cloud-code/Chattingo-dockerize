package com.chattingo.Controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.chattingo.Model.Message;

@Controller
public class RealTimeChat {

    @Autowired
    private SimpMessagingTemplate simpMessagingTemplate;

    @MessageMapping("/message")
    public void recieveMessage(@Payload Message message) {
        Integer chatId = message.getChat().getId();
        boolean isGroup = message.getChat().isGroup();

        String destination = (isGroup ? "/group/" : "/user/") + chatId;
        simpMessagingTemplate.convertAndSend(destination, message);
    }

}
