import { useSelector } from "@xstate/react"
import { useMemo } from "react"
import { ScreenpipeLogoMachineType } from '../state-machines/screenpipe-logo';
import { screenpipeOnboardingMachine } from '../../onboarding/state-machine/onboarding-flow';

/**
 * @description hook exposes all necessary information to render screenpipe logo component.
 */
function useScreenpipeLogo() {
    const screenpipeLogoMachine: ScreenpipeLogoMachineType  = useMemo(() => {
      return screenpipeOnboardingMachine.system.get('screenpipeLogoMachine')
    },[])
  
    const showNeonGradient = useSelector(screenpipeLogoMachine, (snapshot) => {
      return snapshot.hasTag('neonGradient')
    })
  
    const shouldExpand = useSelector(screenpipeLogoMachine, (snapshot) => {
      return snapshot.hasTag('expand')
    })
  
    const showBorderBeam = useSelector(screenpipeLogoMachine, (snapshot) => {
      return snapshot.hasTag('borderBeam')
    })
  
    const showBorder = useSelector(screenpipeLogoMachine, (snapshot) => {
      return snapshot.hasTag('border')
    })
  
    const showGreenBorder = useSelector(screenpipeLogoMachine, (snapshot) => {
      return snapshot.hasTag('greenBorder')
    })
  
    const { duration, strokeWidth, size } = useSelector(screenpipeLogoMachine, (snapshot) => {
      return {
        ...snapshot.context
      }
    })
  
    return {
      showNeonGradient,
      shouldExpand,
      showBorderBeam,
      showBorder,
      showGreenBorder,
      duration,
      strokeWidth,
      size
    }
}

export default useScreenpipeLogo