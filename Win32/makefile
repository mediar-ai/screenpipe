# Purpose: Build the project
include tools/config.mk

OUT = Program.exe

SRCS = $(wildcard src/*.cc)
LIBS = $(wildcard lib/*.cxx)

.PHONY: buildworld

buildworld:
	@echo "Comnpiling..."
	$(CXX) $(SRCS) $(LIBS) \
	$(OPT_Uni) -o $(OUT) $(LIB_LNK)