TEST_SOURCEFILES := $(wildcard ./*.cpp)

honeycomb_unittest.exe: $(TEST_SOURCEFILES) $(HONEYCOMB_SOURCEFILES)
	$(CXX) -Wall -Wextra -g3 -DHONEYCOMB_USE_DEV_METHODS -DHONEYCOMB_NO_ARDUINOHTTPCLIENT_INCLUDE $^ -o $@
	
.PHONY: clean
clean:
	-rm ./honeycomb_unittest.exe