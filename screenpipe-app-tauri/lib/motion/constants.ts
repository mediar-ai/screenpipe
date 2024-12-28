export const opacityVisibility = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 1.2
    }
  }
}

export const scaleAnimation = {
  default: { 
      scale: 1,
      transition: {
          duration: 1,
      }
  },
  shrinkExpand: {
    scale: [1, 0.95, 1.2],
    transition: { 
      duration: 1.2,
      times: [0, 0.2, 1]
    },
  },
};

export const fadeAnimation = {
  default: { 
      opacity: 1,
      transition: {
          duration: 1,
      }
  },
  fade: { 
      opacity: 0,
      transition: {
          duration: 1,
      }
  }
};

export const introAnimation = {
  hidden: {
      scale: 0.95,
      opacity: 0,
      transition: {
          duration: 0.5,
      }
  },
  visible: { 
      scale: 1,
      opacity: 1,
      transition: {
          duration: 1,
      }
  }
};
