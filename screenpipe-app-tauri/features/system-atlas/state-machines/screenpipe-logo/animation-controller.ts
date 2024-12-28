import anime from "animejs";
import { EventObject, fromCallback } from "xstate";

type AnimationControllerInput = { 
    /**
     * sets time that it takes border beam to complete a lap around container.
     */
    duration: number, 
    /**
     * sets border beam's stroke width.
     */
    strokeWidth: number, 
    /**
     * sets border beam's length.
     */
    size: number 
}

/**
 * @param input - initial value of properties to animate.
 * @description a callback actor that handles animation of selected properties. 
 * expects parent actor to handle updating, publishing and persisting values.
 */
const animationController = fromCallback<EventObject, AnimationControllerInput>(({
  input, 
  sendBack, 
}) => {
  anime({
    targets: [
      { rotationDuration: input.duration }, 
      { strokeWidth: input.strokeWidth },
      { size: input.size }
    ],
    rotationDuration: 0.3,
    strokeWidth: 3,
    size: 1400,
    easing: 'easeInOutQuad',
    duration: 2000,
    update: function(anim) {
        sendBack({ 
            type: 'UPDATE', 
            duration: anim.animations[0].currentValue, 
            strokeWidth: anim.animations[1].currentValue,
            size: anim.animations[2].currentValue
        });
    },
    complete: function() {
      sendBack({ type: 'DONE' });
    }
  });
})

export default animationController