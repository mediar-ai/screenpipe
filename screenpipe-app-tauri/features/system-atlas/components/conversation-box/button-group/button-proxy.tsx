import { Button } from '@/components/ui/button';
import ShinyButton from '@/components/ui/shiny-button';
import { UseConvoBoxButtonGroupResult } from './button-group.hook';
import { Spinner } from '@/components/ui/spinner';

export default function ButtonProxy(props: {
    button: UseConvoBoxButtonGroupResult['buttons'][0],
    sendEvent: any,
    isLoading: boolean,
    isDisabled: boolean
}) {
    return (
        <>
            { !props.button.shiny
                ?   <Button
                        disabled={props.isDisabled}
                        isLoading={props.isLoading}
                        variant={props.button.variant as any}
                        className="min-w-[80px]"
                        onClick={() => props.sendEvent(props.button.event)}
                    >
                        {
                            props.isLoading
                            ? <div className="w-[50px]">
                                <Spinner/> 
                            </div>
                            : props.button.label
                        }
                    </Button>
                :   <ShinyButton onClick={() => props.sendEvent(props.button.event)}> 
                        {
                            props.isLoading
                            ? <div className="w-[50px]">
                                <Spinner/> 
                            </div>
                            : props.button.label
                        }
                    </ShinyButton>
            } 
        </>
    )
}