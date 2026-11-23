TEST_SOURCEFILES := $(wildcard ./*.cpp)

honeycomb_unittest.exe: $(TEST_SOURCEFILES) $(HONEYCOMB_SOURCEFILES)
	$(CXX) -Wall -Wextra -g3 -DHONEYCOMB_USE_DEV_METHODS $^ -o $@
	
.PHONY: clean
clean:
	-rm ./honeycomb_unittest.exe