TEST_SOURCEFILES := $(wildcard ./*.cpp)

honeycomb_unittest.exe: $(TEST_SOURCEFILES) $(HONEYCOMB_SOURCEFILES)
	$(CXX) -Wall -Wextra $^ -o $@